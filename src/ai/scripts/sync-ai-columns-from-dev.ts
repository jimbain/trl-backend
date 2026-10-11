/**
 * Copy the three AI columns from the dev database into this one, matching on
 * SKU, and patch the affected Elasticsearch documents as it goes.
 *
 *   npm run ai:sync-from-dev -- --dry-run
 *   npm run ai:sync-from-dev -- --limit 2000      # prove it on a slice first
 *   npm run ai:sync-from-dev
 *   npm run ai:sync-from-dev -- --columns ai_categories
 *   npm run ai:sync-from-dev -- --skip-es
 *
 * Intended to run ON the production application server: writes are then local
 * and only the read crosses the network.
 *
 * ── Required environment (the dev database, read-only) ────────────────────
 *   SOURCE_DB_HOST  SOURCE_DB_PORT  SOURCE_DB_DATABASE
 *   SOURCE_DB_USERNAME  SOURCE_DB_PASSWORD  SOURCE_POSTGRES_SSL
 *
 * Everything else — the target database and Elasticsearch — comes from the
 * usual backend configuration, so this writes to whichever database the app
 * is already pointed at.
 *
 * ── ai_embedding has two sources, deliberately ────────────────────────────
 * Filling audios.ai_embedding on dev costs ~346 ms/row because every update
 * must be inserted into dev's 5 GB HNSW index, so that job runs for days. We
 * do not want production waiting on it. The AI developer's staged vectors
 * live in dev's `recommendTemp` table (sku_temp, "AIVector") and are the same
 * values that job is slowly moving across, so this reads:
 *
 *     COALESCE(audios.ai_embedding, recommendTemp."AIVector")
 *
 * Whether a given vector has already been merged into dev's audios table or
 * is still queued in recommendTemp is irrelevant here — either way production
 * gets it on this pass. If `recommendTemp` has been dropped, the fallback is
 * skipped and the column is read from audios alone.
 *
 * ── Safety ────────────────────────────────────────────────────────────────
 * Writes are COALESCE(new, existing) per column, so a NULL on dev never
 * erases a value here. A row already holding the same value is skipped
 * outright, so re-running costs nothing and produces no dead tuples, no
 * `updated_at` churn and no Elasticsearch traffic.
 *
 * `updated_at` is bumped on every row actually changed. The FAISS recommender
 * ingests new vectors by polling for rows past its watermark, so a sync that
 * leaves the timestamp alone is invisible to it and the index stays empty.
 *
 * ── Memory ────────────────────────────────────────────────────────────────
 * One batch is held at a time and released before the next is read; nothing
 * accumulates across the run. A 768-dim vector is ~9.5 KB as text, so the
 * default batch of 250 rows peaks around 5 MB. That matters because this runs
 * beside the API and, once vectors land, a FAISS index.
 *
 * ── Before a full run ─────────────────────────────────────────────────────
 * Drop the ANN index on this database first. Every UPDATE into an indexed
 * vector column maintains the graph row by row — that is the same cost that
 * makes the dev-side fill a multi-day job. The script refuses to start a
 * large run while it exists and prints the statements.
 */
import { config } from 'dotenv';
import * as fs from 'fs';
import { DataSource, DataSourceOptions } from 'typeorm';
import { Client as ElasticClient } from '@elastic/elasticsearch';
import { getDataSourceOptions } from 'src/database/data_source';

config();

type ColumnKey = 'ai_embedding' | 'ai_categories' | 'AI_Class_Vector';

interface ColumnSpec {
  /** Expression selected from the dev database. */
  source: string;
  /** Target column, quoted where the name is case-sensitive. */
  target: string;
  /** Cast applied to the text value on the way in. */
  cast: string;
}

const COLUMNS: Record<ColumnKey, ColumnSpec> = {
  // The fallback is injected at runtime only when recommendTemp exists.
  ai_embedding: {
    source: 'a.ai_embedding::text',
    target: 'ai_embedding',
    cast: '::vector',
  },
  ai_categories: {
    source: 'a.ai_categories',
    target: 'ai_categories',
    cast: '',
  },
  AI_Class_Vector: {
    source: 'a."AI_Class_Vector"::text',
    target: '"AI_Class_Vector"',
    cast: '::vector',
  },
};

const STAGING_TABLE = '_ai_column_sync_staging';
const ANN_INDEX_NAME = 'idx_audios_ai_class_vector_cos';
const INDEX_GUARD_THRESHOLD = 50_000;
const ADVISORY_LOCK_KEY = 8471120250016;
const DEFAULT_BATCH = 250;
const ES_INDEX = process.env.ELASTICSEARCH_AUDIO_INDEX || 'es_audios';
const MAX_CONSECUTIVE_ERRORS = 10;
const ERROR_BACKOFF_MS = 15_000;

const fmt = (n: number) => n.toLocaleString();

function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface Options {
  dryRun: boolean;
  batchSize: number;
  limit: number;
  columns: ColumnKey[];
  skipEs: boolean;
  allowWithAnnIndex: boolean;
  startAfter: string | null;
}

function parseArgs(argv: string[]): Options {
  const has = (f: string) => argv.includes(f);
  const num = (f: string, d: number) => {
    const i = argv.indexOf(f);
    if (i === -1) return d;
    const n = Number(argv[i + 1]);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${f} expects a number`);
    return n;
  };
  const str = (f: string, d: string | null) => {
    const i = argv.indexOf(f);
    return i === -1 ? d : argv[i + 1];
  };

  const raw = str('--columns', 'all') ?? 'all';
  const columns: ColumnKey[] =
    raw === 'all'
      ? (Object.keys(COLUMNS) as ColumnKey[])
      : raw.split(',').map((c) => c.trim() as ColumnKey);
  for (const c of columns) {
    if (!COLUMNS[c]) {
      throw new Error(
        `unknown column "${c}". Valid: ${Object.keys(COLUMNS).join(', ')}`,
      );
    }
  }

  return {
    dryRun: has('--dry-run'),
    batchSize: num('--batch-size', DEFAULT_BATCH),
    limit: num('--limit', 0),
    columns,
    skipEs: has('--skip-es'),
    allowWithAnnIndex: has('--allow-with-ann-index'),
    startAfter: str('--start-after', null),
  };
}

function sourceDataSource(): DataSource {
  const required = [
    'SOURCE_DB_HOST',
    'SOURCE_DB_USERNAME',
    'SOURCE_DB_PASSWORD',
    'SOURCE_DB_DATABASE',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `missing source database env: ${missing.join(', ')}. ` +
        'These point at the DEV database and are read-only.',
    );
  }
  const ssl = process.env.SOURCE_POSTGRES_SSL === 'true';
  const caPath = process.env.SOURCE_DB_CA_CERT || 'cert/db-ca-certificate.crt';
  return new DataSource({
    type: 'postgres',
    host: process.env.SOURCE_DB_HOST,
    port: parseInt(process.env.SOURCE_DB_PORT || '25060', 10),
    database: process.env.SOURCE_DB_DATABASE,
    username: process.env.SOURCE_DB_USERNAME,
    password: process.env.SOURCE_DB_PASSWORD,
    ssl: ssl
      ? fs.existsSync(caPath)
        ? { rejectUnauthorized: true, ca: fs.readFileSync(caPath).toString() }
        : { rejectUnauthorized: false }
      : false,
    logging: ['error'],
    entities: [],
    migrations: [],
    extra: { max: 2 },
  } as DataSourceOptions);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('='.repeat(64));
  console.log('AI column sync   dev -> this database');
  console.log(`  columns    : ${opts.columns.join(', ')}`);
  console.log(`  batch size : ${opts.batchSize}`);
  console.log(`  dry run    : ${opts.dryRun}`);
  console.log(`  es sync    : ${!opts.skipEs}`);
  console.log('='.repeat(64));

  const src = sourceDataSource();
  const dst = new DataSource({
    ...getDataSourceOptions(),
    logging: ['error'],
    entities: [],
    migrations: [],
  } as DataSourceOptions);

  await src.initialize();
  await dst.initialize();
  console.log(
    `[sync] source ${process.env.SOURCE_DB_HOST}/${process.env.SOURCE_DB_DATABASE}`,
  );
  console.log(
    `[sync] target ${process.env.DB_HOST}/${process.env.DB_DATABASE}`,
  );

  // ── preflight ───────────────────────────────────────────────────────────
  const hasVector = await dst.query(
    "SELECT 1 FROM pg_extension WHERE extname = 'vector'",
  );
  if (!hasVector.length) {
    throw new Error(
      'pgvector is not installed on the target. Run the backend migrations ' +
        'first: npm run build && npm run migration:run',
    );
  }

  const present: string[] = (
    await dst.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'audios'
          AND column_name IN ('ai_embedding','ai_categories','AI_Class_Vector')`,
    )
  ).map((r: any) => r.column_name);
  const missingCols = opts.columns.filter((c) => !present.includes(c));
  if (missingCols.length) {
    throw new Error(
      `target audios is missing ${missingCols.join(', ')} — run migration 1785`,
    );
  }

  // The staged-vector fallback only applies while the AI developer's table
  // still exists; once dev has finished merging it, it will be dropped.
  const hasRecommendTemp =
    (
      await src.query(
        `SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='recommendTemp'`,
      )
    ).length > 0;

  const columnSql: Record<string, string> = {};
  for (const c of opts.columns) {
    columnSql[c] =
      c === 'ai_embedding' && hasRecommendTemp
        ? 'COALESCE(a.ai_embedding, rt."AIVector")::text'
        : COLUMNS[c].source;
  }
  console.log(
    hasRecommendTemp
      ? '[sync] recommendTemp present — ai_embedding falls back to staged vectors'
      : '[sync] recommendTemp absent — ai_embedding read from audios only',
  );

  const notNull = opts.columns
    .map((c) =>
      c === 'ai_categories'
        ? `(${columnSql[c]} IS NOT NULL AND ${columnSql[c]} <> '')`
        : `${columnSql[c]} IS NOT NULL`,
    )
    .join(' OR ');

  const joinRt = hasRecommendTemp
    ? 'LEFT JOIN "recommendTemp" rt ON rt.sku_temp = a.sku'
    : '';

  const [{ count: totalSource }] = await src.query(
    `SELECT count(*)::text AS count FROM audios a ${joinRt} WHERE ${notNull}`,
  );
  console.log(`[sync] source rows carrying data: ${fmt(Number(totalSource))}`);

  // ── ANN index guard ─────────────────────────────────────────────────────
  const annExists =
    (
      await dst.query(
        `SELECT 1 FROM pg_indexes WHERE tablename='audios' AND indexname=$1`,
        [ANN_INDEX_NAME],
      )
    ).length > 0;

  if (
    annExists &&
    Number(totalSource) > INDEX_GUARD_THRESHOLD &&
    !opts.allowWithAnnIndex &&
    !opts.dryRun
  ) {
    console.error(
      `\nREFUSING TO START: ${fmt(Number(totalSource))} rows to sync while ` +
        `${ANN_INDEX_NAME} exists on this database.\n\n` +
        'Every UPDATE into an indexed vector column is inserted into the HNSW\n' +
        'graph row by row. Measured on dev, that is ~346 ms per row and it\n' +
        'dominates everything else — an update writing no vector at all costs\n' +
        'the same.\n\n' +
        'Drop it, sync, then rebuild:\n\n' +
        `  DROP INDEX IF EXISTS ${ANN_INDEX_NAME};\n\n` +
        '  -- afterwards, outside any transaction:\n' +
        "  SET maintenance_work_mem = '1GB';   -- size to the instance\n" +
        `  CREATE INDEX CONCURRENTLY ${ANN_INDEX_NAME}\n` +
        '    ON audios USING hnsw ("AI_Class_Vector" vector_cosine_ops);\n\n' +
        'Or pass --allow-with-ann-index to accept the slowdown.\n',
    );
    await src.destroy();
    await dst.destroy();
    process.exit(1);
  }

  const [{ locked }] = await dst.query(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [ADVISORY_LOCK_KEY],
  );
  if (!locked) {
    console.error(
      '[sync] another instance holds the advisory lock — not starting',
    );
    await src.destroy();
    await dst.destroy();
    process.exit(1);
  }

  // ── staging ─────────────────────────────────────────────────────────────
  if (!opts.dryRun) {
    const cols = opts.columns.map(
      (c) => `${COLUMNS[c].target.replace(/"/g, '')} text`,
    );
    await dst.query(`DROP TABLE IF EXISTS ${STAGING_TABLE}`);
    await dst.query(
      `CREATE UNLOGGED TABLE ${STAGING_TABLE} (sku text PRIMARY KEY, ${cols.join(', ')})`,
    );
    console.log(`[sync] staging table ready (${opts.columns.join(', ')})`);
  }

  const es =
    !opts.skipEs && !opts.dryRun
      ? new ElasticClient({
          node: process.env.ELASTICSEARCH_NODE,
          auth: {
            username: process.env.ELASTICSEARCH_USERNAME!,
            password: process.env.ELASTICSEARCH_PASSWORD!,
          },
          tls: { rejectUnauthorized: false },
          headers: {
            accept: 'application/vnd.elasticsearch+json; compatible-with=8',
            'content-type':
              'application/vnd.elasticsearch+json; compatible-with=8',
          },
        })
      : null;

  let after: string | null = opts.startAfter;
  let seen = 0;
  let updated = 0;
  let unchanged = 0;
  let notInTarget = 0;
  let esUpdated = 0;
  let esMissing = 0;
  let batches = 0;
  let consecutiveErrors = 0;
  let stopping = false;

  const onSignal = (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[sync] ${sig} — stopping after the current batch`);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  const selectList = ['a.sku AS sku']
    .concat(opts.columns.map((c) => `${columnSql[c]} AS "${c}"`))
    .join(', ');

  const t0 = Date.now();

  while (!stopping) {
    if (opts.limit && seen >= opts.limit) {
      console.log(
        `[sync] --limit ${fmt(opts.limit)} reached — stopping cleanly`,
      );
      break;
    }

    // Keyset, not OFFSET: OFFSET re-scans everything it skips, so late
    // batches would re-read a million rows to produce a few hundred.
    // Ordering is computed on the source only — the target is matched by
    // explicit SKU through staging, so the two databases never need to agree
    // on collation.
    let rows: Array<Record<string, string | null>>;
    try {
      rows = await src.query(
        `SELECT ${selectList}
           FROM audios a ${joinRt}
          WHERE (${notNull}) ${after ? 'AND a.sku > $2' : ''}
          ORDER BY a.sku
          LIMIT $1`,
        after ? [opts.batchSize, after] : [opts.batchSize],
      );
      consecutiveErrors = 0;
    } catch (err: any) {
      consecutiveErrors += 1;
      console.error(
        `[sync] source read failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err?.message}`,
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) break;
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
      continue;
    }

    if (!rows.length) {
      console.log('[sync] no more source rows — done');
      break;
    }

    const skus = rows.map((r) => r.sku as string);
    after = skus[skus.length - 1];
    seen += rows.length;
    batches += 1;

    if (opts.dryRun) {
      const [{ count }] = await dst.query(
        'SELECT count(*)::text AS count FROM audios WHERE sku = ANY($1)',
        [skus],
      );
      notInTarget += rows.length - Number(count);
      console.log(
        `[dry-run] batch ${batches}: ${rows.length} source rows, ` +
          `${count} present here, ${rows.length - Number(count)} absent ` +
          `(through sku ${after})`,
      );
      continue;
    }

    try {
      // Multi-row INSERT rather than one statement per row: 4 columns x 250
      // rows is 1,000 bind parameters, well inside the 65,535 limit, and it
      // is a single round trip.
      const colNames = [
        'sku',
        ...opts.columns.map((c) => COLUMNS[c].target.replace(/"/g, '')),
      ];
      const params: Array<string | null> = [];
      const tuples = rows.map((r, i) => {
        const base = i * colNames.length;
        params.push(r.sku as string, ...opts.columns.map((c) => r[c] ?? null));
        return `(${colNames.map((_, j) => `$${base + j + 1}`).join(', ')})`;
      });

      await dst.query(`TRUNCATE ${STAGING_TABLE}`);
      await dst.query(
        `INSERT INTO ${STAGING_TABLE} (${colNames.join(', ')}) VALUES ${tuples.join(', ')}`,
        params,
      );

      // COALESCE so a NULL on dev never clears a value here, and
      // IS DISTINCT FROM so a row already holding the value is left alone —
      // no dead tuple, no updated_at churn, no Elasticsearch traffic.
      const sets = opts.columns.map((c) => {
        const col = COLUMNS[c].target.replace(/"/g, '');
        return `${COLUMNS[c].target} = COALESCE(s.${col}${COLUMNS[c].cast}, a.${COLUMNS[c].target})`;
      });
      const changed = opts.columns.map((c) => {
        const col = COLUMNS[c].target.replace(/"/g, '');
        return `(s.${col}${COLUMNS[c].cast} IS NOT NULL AND a.${COLUMNS[c].target} IS DISTINCT FROM s.${col}${COLUMNS[c].cast})`;
      });

      const result = await dst.query(
        `UPDATE audios a
            SET ${sets.join(', ')}, updated_at = now()
           FROM ${STAGING_TABLE} s
          WHERE a.sku = s.sku
            AND (${changed.join(' OR ')})`,
      );
      const n = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
      updated += n;
      unchanged += rows.length - n;
      consecutiveErrors = 0;

      // Only ai_categories reaches Elasticsearch — the vectors are not in the
      // mapping at all. So this is a partial update of one field, not a
      // document rebuild, which would mean duplicating the backend's join and
      // transform logic here and keeping it in step forever.
      let esNote = '';
      if (es && n > 0 && opts.columns.includes('ai_categories')) {
        const docs: Array<{ id: string; ai_categories: string }> =
          await dst.query(
            `SELECT id, ai_categories FROM audios
            WHERE sku = ANY($1) AND ai_categories IS NOT NULL AND ai_categories <> ''`,
            [skus],
          );
        if (docs.length) {
          const operations = docs.flatMap((d) => [
            { update: { _index: ES_INDEX, _id: d.id } },
            {
              doc: {
                // Mirrors audio-elasticsearch-sync.service.ts exactly: comma
                // separated, trimmed, empties dropped. The admin list reads
                // hit._source.ai_categories and maps over it directly.
                ai_categories: d.ai_categories
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean),
              },
            },
          ]);
          // doc_as_upsert is deliberately off: a missing document is reported,
          // not replaced by a stub containing a single field.
          const res: any = await es.bulk({ operations, refresh: false });
          for (const item of res.items ?? []) {
            const st = item.update?.status ?? 0;
            if (st === 200 || st === 201) esUpdated += 1;
            else if (st === 404) esMissing += 1;
          }
          esNote = `, es ${docs.length}`;
        }
      }

      const elapsedS = (Date.now() - t0) / 1000;
      const rate = seen / elapsedS;
      const remaining = Math.max(0, Number(totalSource) - seen);
      console.log(
        `[sync] batch ${batches}: ${rows.length} read, ${n} updated${esNote}  |  ` +
          `${fmt(seen)}/${fmt(Number(totalSource))}  |  ${rate.toFixed(0)} rows/s  |  ` +
          `ETA ${humanDuration(remaining / rate)}  |  after ${after}`,
      );
    } catch (err: any) {
      consecutiveErrors += 1;
      console.error(
        `[sync] batch failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err?.message}`,
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('[sync] too many consecutive failures — giving up');
        break;
      }
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
    }
  }

  console.log('─'.repeat(64));
  console.log(`[sync] source rows read : ${fmt(seen)}`);
  console.log(`[sync] rows updated     : ${fmt(updated)}`);
  console.log(`[sync] already current  : ${fmt(unchanged)}`);
  if (opts.dryRun) console.log(`[sync] absent here      : ${fmt(notInTarget)}`);
  if (es) console.log(`[sync] es updated       : ${fmt(esUpdated)}`);
  if (esMissing) {
    console.log(
      `[sync] es MISSING docs  : ${fmt(esMissing)} — not created. ` +
        'Run `npm run elastic:sync-audios` to build them properly.',
    );
  }
  console.log(
    `[sync] elapsed          : ${humanDuration((Date.now() - t0) / 1000)}`,
  );
  if (after) {
    console.log(`[sync] resume with      : --start-after ${after}`);
  }
  if (updated > 0) {
    console.log(
      '[sync] next: press reindex in the admin panel so FAISS ingests the ' +
        'new vectors (updated_at was bumped, so the delta pass will see them).',
    );
  }

  if (!opts.dryRun) await dst.query(`DROP TABLE IF EXISTS ${STAGING_TABLE}`);
  await dst.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  await src.destroy();
  await dst.destroy();
}

main().catch((err) => {
  console.error('[sync] fatal:', err?.message ?? err);
  process.exit(1);
});
