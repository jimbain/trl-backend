import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the three AI columns on `audios` that until now existed only because the
 * AI dev created them by hand on dev/staging:
 *
 *   ai_embedding      vector(768)             — "By Prompt" pipeline (FAISS, recommender.py)
 *   ai_categories     character varying(250)  — comma-joined AI category labels (admin Curation UI)
 *   AI_Class_Vector   vector(768)             — "Active-Based List" pipeline (pgvector ANN)
 *
 * …plus the pgvector extension and ONE ANN index on `AI_Class_Vector`.
 *
 * ── Ordering ────────────────────────────────────────────────────────────────
 * The timestamp is deliberately LOWER than 1786000000000
 * (CreateAiActiveRecommendations), because that migration *verifies* the
 * presence of `AI_Class_Vector` and throws when it is missing. On a virgin
 * production database the columns must therefore exist first.
 * TypeORM sorts pending migrations by timestamp and filters out already-executed
 * ones independently, so slotting in an earlier timestamp is safe on dev/staging
 * where 1786/1787 have already run — this migration simply runs on its own.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Every statement is a no-op when the object already exists, so re-running
 * against dev (where all three columns and both indexes were created manually)
 * changes nothing and raises nothing. Types are re-verified after the fact:
 * ADD COLUMN IF NOT EXISTS silently skips a column that exists with the *wrong*
 * type, and silent drift on an embedding column is far worse than a failed
 * deploy — so we assert instead.
 *
 * ── Index choice: HNSW, not IVFFlat ─────────────────────────────────────────
 * The AI dev supplied both. Only the HNSW one belongs here:
 *
 *   1. IVFFlat derives its centroids from the rows present AT BUILD TIME. In a
 *      fresh production deploy this column is created empty, so an IVFFlat index
 *      built here would be trained on zero rows and be worthless (pgvector even
 *      warns about it). HNSW needs no training set and accepts rows incrementally.
 *   2. IVFFlat recall decays as the catalogue grows away from those centroids and
 *      needs periodic REINDEX. `embed_new_inactive.py` adds vectors on every run,
 *      so that decay is continuous. HNSW has no such maintenance.
 *   3. `lists = 1000` is mistuned for this table anyway: pgvector recommends
 *      sqrt(rows) above 1M rows — sqrt(1.35M) ≈ 1160 — and the server default
 *      `ivfflat.probes = 1` yields poor recall unless raised to ≈ sqrt(lists),
 *      which erodes the speed advantage that was the point of IVFFlat.
 *   4. On the current dataset HNSW is also the smaller of the two on disk
 *      (4.8 GB vs 5.4 GB) at strictly better speed-recall.
 *
 * Measured on staging (1,355,626 vectors), recall@50 against an exact KNN
 * baseline, using the literal query `active_recommendations.py` issues:
 *
 *     exact (seq scan)                ~39,000 ms    100 %   (baseline)
 *     ivfflat  probes=1                  ~350 ms   76-86 %
 *     ivfflat  probes=32               ~2,860 ms   98-100 %
 *     hnsw     ef_search=100             ~290 ms      98 %
 *     hnsw     ef_search=500             ~320 ms   98-100 %
 *
 * HNSW reaches full recall at IVFFlat's probes=1 latency; IVFFlat needs
 * probes=32 to match it, which is ~9x slower. Note also that while BOTH indexes
 * exist the planner costs the probes=1 IVFFlat scan lowest and picks it, so the
 * pipeline silently loses 14-24 % of its true nearest neighbours on every one of
 * the ~1,950 per-active-book queries. Production only ever gets the HNSW index
 * from this migration; on dev/staging the leftover IVFFlat should be dropped:
 *
 *     DROP INDEX CONCURRENTLY idx_audios_vector_ivf;   -- frees 5.4 GB
 *
 * `vector_cosine_ops` matches the `<=>` operator used by
 * `active_recommendations.py`; the operator class must agree with the query
 * operator or the planner ignores the index entirely.
 *
 * ── Why the build is guarded ────────────────────────────────────────────────
 * TypeORM 0.3.28 runs migrations with `transaction: 'all'` and refuses any
 * migration that overrides the mode, so CREATE INDEX CONCURRENTLY (which cannot
 * run inside a transaction) is not available here. A plain CREATE INDEX takes a
 * SHARE lock — reads keep working, writes to `audios` block for the whole build.
 * On an empty column that is milliseconds; on a populated one it is hours.
 * So: build inline only while the column is still small, otherwise skip and tell
 * the operator to build it CONCURRENTLY out of band. Blocking a production deploy
 * for hours is not something a migration should decide on its own.
 */

const TABLE = 'audios';
const VECTOR_DIMS = 768;
const INDEX_NAME = 'idx_audios_ai_class_vector_cos';

/**
 * Above this many non-NULL vectors we refuse to build the index inside the
 * deploy transaction. ~100k x 768 float32 is ≈300 MB of vectors — an in-memory
 * build of a few minutes at 512 MB maintenance_work_mem. Beyond that the build
 * spills to disk and the write lock outlasts any reasonable deploy window.
 */
const INLINE_INDEX_BUILD_MAX_ROWS = 100_000;

const EXPECTED_COLUMNS: ReadonlyArray<{
  name: string;
  ddlType: string;
  expectedType: string;
}> = [
  {
    name: 'ai_embedding',
    ddlType: `vector(${VECTOR_DIMS})`,
    expectedType: `vector(${VECTOR_DIMS})`,
  },
  {
    name: 'ai_categories',
    ddlType: 'character varying(250)',
    expectedType: 'character varying(250)',
  },
  {
    name: 'AI_Class_Vector',
    ddlType: `vector(${VECTOR_DIMS})`,
    expectedType: `vector(${VECTOR_DIMS})`,
  },
];

export class AddAiColumnsToAudios1785000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureVectorExtension(queryRunner);
    await this.ensureColumns(queryRunner);
    await this.ensureAnnIndex(queryRunner);
  }

  /**
   * Intentionally non-destructive.
   *
   * Everything this migration creates is expensive and irreplaceable: the two
   * vector columns hold ~1.35M embeddings that cost hours of model inference to
   * recompute, and the HNSW index is a multi-GB multi-hour build. A rollback
   * triggered by an unrelated failure further down the migration chain must not
   * vaporise them. This mirrors the convention already set by
   * CreateAiActiveRecommendations1786000000000, which likewise refuses to drop
   * artefacts owned by the AI pipeline.
   *
   * To undo by hand, deliberately:
   *   DROP INDEX IF EXISTS idx_audios_ai_class_vector_cos;
   *   ALTER TABLE audios DROP COLUMN IF EXISTS "AI_Class_Vector";
   *   ALTER TABLE audios DROP COLUMN IF EXISTS ai_embedding;
   *   ALTER TABLE audios DROP COLUMN IF EXISTS ai_categories;
   */
  public async down(): Promise<void> {
    console.warn(
      '[1785000000000] down() is a deliberate no-op — the AI columns hold ~1.35M ' +
        'embeddings and a multi-GB ANN index that cost hours to rebuild. ' +
        'See the migration header for the manual teardown statements.',
    );
  }

  // ───────────────────────────── steps ──────────────────────────────

  private async ensureVectorExtension(queryRunner: QueryRunner): Promise<void> {
    const installed = await queryRunner.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'vector'`,
    );
    if (installed.length) return;

    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    } catch (err: any) {
      throw new Error(
        `Could not install the pgvector extension: ${err?.message}. ` +
          `Run "CREATE EXTENSION vector;" as a privileged role on this database ` +
          `(on DigitalOcean managed Postgres the doadmin role is sufficient), then re-run migrations.`,
      );
    }
  }

  private async ensureColumns(queryRunner: QueryRunner): Promise<void> {
    for (const column of EXPECTED_COLUMNS) {
      // All three are nullable with no default, so this is a catalogue-only
      // change in PG 11+ — instant even on the 1.4M-row audios table.
      await queryRunner.query(
        `ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS "${column.name}" ${column.ddlType}`,
      );
    }

    // ADD COLUMN IF NOT EXISTS does not validate the type of a pre-existing
    // column. Assert, so a hand-made column of the wrong shape fails the deploy
    // instead of silently breaking the embedding pipelines later.
    const actual: Array<{ attname: string; full_type: string }> =
      await queryRunner.query(
        `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS full_type
           FROM pg_attribute a
          WHERE a.attrelid = '${TABLE}'::regclass
            AND a.attnum > 0
            AND NOT a.attisdropped
            AND a.attname = ANY($1)`,
        [EXPECTED_COLUMNS.map((c) => c.name)],
      );

    const byName = new Map(actual.map((r) => [r.attname, r.full_type]));
    const drift = EXPECTED_COLUMNS.filter(
      (c) => byName.get(c.name) !== c.expectedType,
    );

    if (drift.length) {
      const detail = drift
        .map(
          (c) =>
            `"${c.name}" expected ${c.expectedType}, found ${byName.get(c.name) ?? 'MISSING'}`,
        )
        .join('; ');
      throw new Error(
        `audios AI column type mismatch — ${detail}. ` +
          `Reconcile the column definition by hand before re-running migrations. ` +
          `Failing the deploy is deliberate: a vector column of the wrong dimension ` +
          `silently corrupts both AI pipelines, and a silently widened/narrowed ` +
          `ai_categories diverges dev from production.`,
      );
    }
  }

  private async ensureAnnIndex(queryRunner: QueryRunner): Promise<void> {
    // Detect by column + access method rather than by name: dev already carries
    // an hnsw index AND an ivfflat one under the AI dev's own names, and we must
    // never start a second multi-GB build alongside them.
    const existing: Array<{ index_name: string; amname: string }> =
      await queryRunner.query(
        `SELECT c.relname AS index_name, am.amname
           FROM pg_index i
           JOIN pg_class c ON c.oid = i.indexrelid
           JOIN pg_am am ON am.oid = c.relam
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = '${TABLE}'::regclass
            AND am.amname IN ('hnsw', 'ivfflat')
            AND a.attname = 'AI_Class_Vector'`,
      );

    if (existing.length) {
      console.log(
        `[1785000000000] ANN index already present on audios."AI_Class_Vector" ` +
          `(${existing.map((e) => `${e.index_name}:${e.amname}`).join(', ')}) — skipping build.`,
      );
      return;
    }

    const [{ populated }]: Array<{ populated: string }> =
      await queryRunner.query(
        `SELECT count(*)::text AS populated FROM "${TABLE}" WHERE "AI_Class_Vector" IS NOT NULL`,
      );
    const populatedRows = Number(populated);

    if (populatedRows > INLINE_INDEX_BUILD_MAX_ROWS) {
      console.warn(
        `[1785000000000] ACTION REQUIRED — audios."AI_Class_Vector" already holds ` +
          `${populatedRows.toLocaleString()} vectors (threshold ${INLINE_INDEX_BUILD_MAX_ROWS.toLocaleString()}). ` +
          `Building the HNSW index here would hold a write lock on audios for hours ` +
          `inside the deploy transaction, so it has been SKIPPED.\n` +
          `Run this out of band, outside any transaction, once the deploy has settled:\n` +
          `    SET maintenance_work_mem = '512MB';\n` +
          `    CREATE INDEX CONCURRENTLY ${INDEX_NAME}\n` +
          `      ON ${TABLE} USING hnsw ("AI_Class_Vector" vector_cosine_ops);\n` +
          `Until then the Active-Based List pipeline still works, but every ANN query ` +
          `falls back to a sequential scan.`,
      );
      return;
    }

    // Small enough to build inline. Raise maintenance_work_mem for the build so
    // the graph is assembled in memory rather than spilling to disk, then put it
    // back — SET LOCAL would otherwise leak into the migrations that follow,
    // since TypeORM wraps the whole run in a single transaction.
    const [{ maintenance_work_mem: previousWorkMem }]: Array<{
      maintenance_work_mem: string;
    }> = await queryRunner.query(`SHOW maintenance_work_mem`);

    await queryRunner.query(`SET LOCAL maintenance_work_mem = '512MB'`);
    try {
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${INDEX_NAME}
           ON "${TABLE}" USING hnsw ("AI_Class_Vector" vector_cosine_ops)`,
      );
      console.log(
        `[1785000000000] built HNSW index ${INDEX_NAME} over ${populatedRows.toLocaleString()} vectors.`,
      );
    } finally {
      await queryRunner.query(
        `SET LOCAL maintenance_work_mem = '${previousWorkMem}'`,
      );
    }
  }
}
