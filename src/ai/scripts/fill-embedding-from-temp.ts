/**
 * Move `ai_embedding` from the AI developer's `recommendTemp` staging table
 * into `audios`, matching `audios.sku` to `recommendTemp.sku_temp`.
 *
 *   npm run ai:fill-embedding-from-temp
 *   npm run ai:fill-embedding-from-temp -- --batch-size 100
 *   npm run ai:fill-embedding-from-temp -- --limit 1000      # smoke test
 *   npm run ai:fill-embedding-from-temp -- --max-runtime-min 240
 *
 * Both tables live in the same database, so no vector data crosses the
 * network: every batch is one server-side statement. The client only ever
 * sees row counts.
 *
 * ── Why this is slow, and why that is accepted ─────────────────────────────
 * Measured on dev: ~346 ms per row. Not the data copy — an UPDATE that writes
 * no vector at all, touching only `updated_at`, costs the same. Every row
 * update creates a new tuple version, and because the pages are full there is
 * no room for a HOT update, so Postgres must insert into all seven indexes on
 * `audios`. One of them is the 5 GB HNSW graph over AI_Class_Vector, and
 * graph insertion against 780 MB of shared_buffers is random I/O.
 *
 * Dropping that index would make this roughly two orders of magnitude faster,
 * but rebuilding a 1.42M-vector HNSW index afterwards costs hours and leaves
 * the Active-Based List ranking on a sequential scan meanwhile. The deliberate
 * choice is to run slowly against a fully functional database rather than
 * quickly against a degraded one. At ~3 rows/s this is a multi-day background
 * job, which is why everything below is built for interruption rather than
 * for speed.
 *
 * ── Resumability ──────────────────────────────────────────────────────────
 * `recommendTemp` IS the work queue. Each batch updates its rows and deletes
 * them in the same statement, so a row is either still queued or already
 * applied — never both, and never twice. There is no cursor or progress file
 * to lose: killing this process and starting it again simply continues.
 *
 * Nothing is overwritten. Verified before writing this: of 743,829 staged
 * rows, zero were orphans and zero targeted an audios row that already had an
 * embedding. The WHERE clause enforces that anyway.
 *
 * `updated_at` is bumped on every row it touches. That is load-bearing: the
 * FAISS recommender ingests new vectors by polling for rows past its
 * watermark, so a fill that leaves the timestamp alone is invisible to it and
 * the index never grows. We shipped that bug once already.
 */
import { config } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { getDataSourceOptions } from 'src/database/data_source';

config();

const SOURCE_TABLE = '"recommendTemp"';
const SOURCE_KEY = 'sku_temp';
const SOURCE_VECTOR = '"AIVector"';

/**
 * Small on purpose. Throughput is fixed by index maintenance per row, so a
 * larger batch buys nothing and only widens the window of work lost to a
 * kill. At ~346 ms/row a batch of 100 commits roughly every 35 seconds.
 */
const DEFAULT_BATCH_SIZE = 100;

/** Cross-process single-flight, so two operators cannot double up. */
const ADVISORY_LOCK_KEY = 8471120250015;

/** A multi-day job will meet transient network blips; they are not failures. */
const MAX_CONSECUTIVE_ERRORS = 10;
const ERROR_BACKOFF_MS = 15_000;

interface Options {
  batchSize: number;
  limit: number;
  maxRuntimeMin: number;
}

function parseArgs(argv: string[]): Options {
  const read = (flag: string, fallback: number): number => {
    const i = argv.indexOf(flag);
    if (i === -1) return fallback;
    const n = Number(argv[i + 1]);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`${flag} expects a non-negative number`);
    }
    return n;
  };
  return {
    batchSize: read('--batch-size', DEFAULT_BATCH_SIZE),
    limit: read('--limit', 0),
    maxRuntimeMin: read('--max-runtime-min', 0),
  };
}

const fmt = (n: number) => n.toLocaleString();

function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const ds = new DataSource({
    ...getDataSourceOptions(),
    // Query logging would print a line per batch for days.
    logging: ['error'],
    entities: [],
    migrations: [],
  } as DataSourceOptions);

  await ds.initialize();
  console.log(
    `[fill] connected to ${process.env.DB_HOST}/${process.env.DB_DATABASE}`,
  );

  const [{ locked }] = await ds.query(
    'SELECT pg_try_advisory_lock($1) AS locked',
    [ADVISORY_LOCK_KEY],
  );
  if (!locked) {
    console.error(
      '[fill] another instance holds the advisory lock. Wait for it rather ' +
        'than running two — they would fight over the same rows.',
    );
    await ds.destroy();
    process.exit(1);
  }

  const snapshot = async () =>
    (
      await ds.query(`SELECT
        (SELECT count(*) FROM ${SOURCE_TABLE})::bigint AS queued,
        (SELECT count(*) FROM audios WHERE ai_embedding IS NOT NULL)::bigint AS embedded`)
    )[0];

  const start = await snapshot();
  console.log(
    `[fill] queued in recommendTemp: ${fmt(Number(start.queued))}  |  ` +
      `audios already embedded: ${fmt(Number(start.embedded))}`,
  );
  console.log(
    `[fill] batch size ${opts.batchSize}` +
      (opts.limit ? `, stopping after ~${fmt(opts.limit)} rows` : '') +
      (opts.maxRuntimeMin ? `, budget ${opts.maxRuntimeMin} min` : ''),
  );

  // One statement per batch. The data-modifying CTE always executes to
  // completion even though the DELETE does not read from it, which is what
  // lets the update and the dequeue share a single snapshot — a row cannot be
  // deleted without having been applied, or applied twice.
  const batchSql = `
    WITH batch AS (
      SELECT ${SOURCE_KEY}, ${SOURCE_VECTOR}
      FROM ${SOURCE_TABLE}
      ORDER BY ${SOURCE_KEY}
      LIMIT $1
    ), applied AS (
      UPDATE audios a
         SET ai_embedding = b.${SOURCE_VECTOR},
             updated_at   = now()
        FROM batch b
       WHERE a.sku = b.${SOURCE_KEY}
         AND a.ai_embedding IS NULL
    )
    DELETE FROM ${SOURCE_TABLE} t
     USING batch b
     WHERE t.${SOURCE_KEY} = b.${SOURCE_KEY}`;

  let dequeued = 0;
  let batches = 0;
  let consecutiveErrors = 0;
  let stopping = false;

  // Finish the batch in flight rather than tearing down mid-statement; the
  // next run would only have to redo it.
  const onSignal = (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[fill] ${sig} received — stopping after the current batch`);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  const t0 = Date.now();
  const deadline = opts.maxRuntimeMin
    ? t0 + opts.maxRuntimeMin * 60_000
    : Infinity;

  while (!stopping) {
    if (Date.now() > deadline) {
      console.log('[fill] runtime budget reached — stopping cleanly');
      break;
    }
    if (opts.limit && dequeued >= opts.limit) {
      console.log(
        `[fill] --limit ${fmt(opts.limit)} reached — stopping cleanly`,
      );
      break;
    }

    const batchStart = Date.now();
    let moved: number;
    try {
      const result = await ds.query(batchSql, [opts.batchSize]);
      // node-postgres returns [rows, rowCount] for a DELETE via TypeORM.
      moved = Array.isArray(result) ? Number(result[1] ?? 0) : 0;
      consecutiveErrors = 0;
    } catch (err: any) {
      consecutiveErrors += 1;
      console.error(
        `[fill] batch failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${err?.message}`,
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('[fill] too many consecutive failures — giving up');
        break;
      }
      await new Promise((r) => setTimeout(r, ERROR_BACKOFF_MS));
      continue;
    }

    if (moved === 0) {
      console.log('[fill] recommendTemp is empty — nothing left to move');
      break;
    }

    dequeued += moved;
    batches += 1;

    const elapsedS = (Date.now() - t0) / 1000;
    const rate = dequeued / elapsedS;
    const remaining = Math.max(0, Number(start.queued) - dequeued);
    const batchS = ((Date.now() - batchStart) / 1000).toFixed(1);

    console.log(
      `[fill] batch ${batches}: ${moved} rows in ${batchS}s  |  ` +
        `${fmt(dequeued)} done, ${fmt(remaining)} left  |  ` +
        `${rate.toFixed(1)} rows/s  |  ETA ${humanDuration(remaining / rate)}`,
    );
  }

  const end = await snapshot();
  const elapsedS = (Date.now() - t0) / 1000;
  console.log('─'.repeat(60));
  console.log(`[fill] dequeued this run : ${fmt(dequeued)}`);
  console.log(`[fill] still queued      : ${fmt(Number(end.queued))}`);
  console.log(
    `[fill] audios embedded   : ${fmt(Number(start.embedded))} -> ${fmt(Number(end.embedded))}`,
  );
  console.log(`[fill] elapsed           : ${humanDuration(elapsedS)}`);
  if (Number(end.queued) > 0) {
    console.log('[fill] re-run this command to continue where it stopped.');
  }

  await ds.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
  await ds.destroy();
}

main().catch((err) => {
  console.error('[fill] fatal:', err?.message ?? err);
  process.exit(1);
});
