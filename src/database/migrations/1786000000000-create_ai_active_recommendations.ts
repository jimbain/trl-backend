import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the storage + tracking tables for the "Active-Based List" AI
 * recommendation pipeline (Feature 1 from AI dev's monthly workflow).
 *
 * The `audios."AI_Class_Vector"` column, the `vector` extension, and the ANN
 * index on that column are all provisioned OUTSIDE this repository by the AI
 * dev's one-time setup (his email lists them under "One-time Tasks completed").
 * This migration therefore VERIFIES their presence rather than creating them —
 * creating a vector column here risks a type/dimension mismatch with what he
 * already has in production.
 *
 * Idempotent by design: all DDL uses `IF NOT EXISTS`, and the app_config seed
 * uses `ON CONFLICT (key) DO NOTHING` so re-running the migration never
 * clobbers values an admin may have already tuned in the Configuration page.
 */
export class CreateAiActiveRecommendations1786000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Verify pgvector extension is present (dev's one-time setup).
    const ext = await queryRunner.query(
      `SELECT extname FROM pg_extension WHERE extname = 'vector'`,
    );
    if (!ext.length) {
      // Try to create it in case we're in a fresh dev env; if the DB user
      // lacks superuser, this will surface a clear error.
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    }

    // 2. Verify the AI_Class_Vector column exists with the correct pgvector
    // type. If missing, halt with an actionable message.
    const col = await queryRunner.query(`
      SELECT udt_name
        FROM information_schema.columns
       WHERE table_name = 'audios' AND column_name = 'AI_Class_Vector'
    `);
    if (!col.length || col[0].udt_name !== 'vector') {
      throw new Error(
        `audios."AI_Class_Vector" column missing or not of pgvector type. ` +
          `The AI dev's one-time setup (embedding backfill + column creation) ` +
          `must be applied before this migration.`,
      );
    }

    // 3. Recommendations table — one row per (batch, ranked book).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_recommended_active_audios (
        id                  varchar(35)      NOT NULL PRIMARY KEY,
        batch_id            uuid             NOT NULL,
        sku                 varchar          NOT NULL,
        rank                integer          NOT NULL,
        ai_similarity_score double precision NOT NULL,
        computed_at         timestamp        NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_reco_batch_rank
        ON ai_recommended_active_audios (batch_id, rank)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_reco_sku
        ON ai_recommended_active_audios (sku)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_reco_computed_at
        ON ai_recommended_active_audios (computed_at DESC)`,
    );

    // 4. Run tracker — status card + audit trail.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_recommendation_runs (
        id             varchar(35) NOT NULL PRIMARY KEY,
        batch_id       uuid        NOT NULL UNIQUE,
        status         varchar(20) NOT NULL,
        stage          varchar(20),
        triggered_by   varchar(20) NOT NULL,
        started_at     timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at   timestamp,
        rows_produced  integer,
        error_message  text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_reco_runs_started
        ON ai_recommendation_runs (started_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ai_reco_runs_status
        ON ai_recommendation_runs (status)`,
    );

    // 5. Working table for the embedding backfill phase (replaces the dev's
    // manual "import CSV into temp" step). UNLOGGED — we truncate it every
    // run, no need for WAL.
    await queryRunner.query(`
      CREATE UNLOGGED TABLE IF NOT EXISTS ai_embedding_import_temp (
        sku_temp  varchar,
        ai_vector text
      )
    `);

    // 6. Seed the new app_config keys. ON CONFLICT DO NOTHING so admin-tuned
    // values are preserved across re-applies.
    await queryRunner.query(`
      INSERT INTO app_configs (key, value) VALUES
        ('ai_recommendation_interval_days',     '30'),
        ('ai_recommendation_top_n',             '1000'),
        ('ai_recommendation_top_k_per_active',  '50')
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop only what this migration created. Never drop:
    //   - the `vector` extension (shared with the "By Prompt" pipeline eventually,
    //     and with whatever the AI dev depends on outside this repo)
    //   - audios."AI_Class_Vector" or its index (owned by the AI dev's setup)
    //   - the three app_config rows (admin may have tuned them — losing those
    //     values on a rollback would be a nasty surprise)
    await queryRunner.query(`DROP TABLE IF EXISTS ai_embedding_import_temp`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS ai_recommended_active_audios`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ai_recommendation_runs`);
  }
}
