import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Feature 2 — Popularity scoring for active audios.
 *
 * Three tables:
 *   1. audio_popularity_scores  — one row per audio (current view)
 *   2. audio_popularity_history — append-only per (audio, batch) for trend / audit
 *   3. audio_popularity_runs    — pipeline run tracker (mirrors ai_recommendation_runs)
 *
 * Plus three app_configs keys: interval, the Open Library source weight, and
 * min-confidence. The header previously claimed five keys and three source
 * weights; it seeded four, and an iTunes source named in an early draft was
 * never built. Google Books was dropped before this ever reached production —
 * its field-scoped query operators return nothing from the public v1 API, so
 * it matched 0 of 2,025 titles across 37 dev runs.
 *
 * Idempotent: all DDL uses IF NOT EXISTS; seeds use ON CONFLICT DO NOTHING so
 * admin-tuned values are preserved across re-applies. down() drops only the
 * tables this migration created; app_configs rows are left in place.
 */
export class CreateAudioPopularity1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Current-view table — one row per audio, upserted on sku.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audio_popularity_scores (
        id                      varchar(35) NOT NULL PRIMARY KEY,
        sku                     varchar     NOT NULL UNIQUE,
        popularity_score        smallint    NOT NULL,
        confidence              smallint    NOT NULL,
        sources                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
        source_weights_version  varchar(64) NOT NULL,
        computed_at             timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audio_popularity_scores_score
        ON audio_popularity_scores (popularity_score DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audio_popularity_scores_confidence
        ON audio_popularity_scores (confidence)`,
    );

    // 2. History — append-only, purge-able. Keyed by batch for run-level lookups.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audio_popularity_history (
        id                      varchar(35) NOT NULL PRIMARY KEY,
        sku                     varchar     NOT NULL,
        batch_id                uuid        NOT NULL,
        popularity_score        smallint    NOT NULL,
        confidence              smallint    NOT NULL,
        sources                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
        source_weights_version  varchar(64) NOT NULL,
        computed_at             timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audio_popularity_history_sku_computed
        ON audio_popularity_history (sku, computed_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audio_popularity_history_batch
        ON audio_popularity_history (batch_id)`,
    );

    // 3. Runs — same shape as ai_recommendation_runs so admin panel status card
    //    can reuse the visual pattern.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audio_popularity_runs (
        id                varchar(35) NOT NULL PRIMARY KEY,
        batch_id          uuid        NOT NULL UNIQUE,
        status            varchar(20) NOT NULL,
        stage             varchar(30),
        triggered_by      varchar(20) NOT NULL,
        started_at        timestamp   NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at      timestamp,
        audios_processed  integer,
        audios_matched    integer,
        error_message     text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audio_popularity_runs_started
        ON audio_popularity_runs (started_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audio_popularity_runs_status
        ON audio_popularity_runs (status)`,
    );

    // 4. Seed the 5 new app_config keys — ON CONFLICT preserves any admin
    //    tuning that may have already been applied.
    await queryRunner.query(`
      INSERT INTO app_configs (key, value) VALUES
        ('popularity_interval_days',              '1'),
        ('popularity_source_weight_openlibrary',  '1.00'),
        ('popularity_min_confidence_display',     '1')
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop only what this migration created. Preserve the 5 app_config rows
    // (an admin may have tuned them; losing values on rollback would be a
    // nasty surprise) — matches the Feature 1 migration convention.
    await queryRunner.query(`DROP TABLE IF EXISTS audio_popularity_history`);
    await queryRunner.query(`DROP TABLE IF EXISTS audio_popularity_scores`);
    await queryRunner.query(`DROP TABLE IF EXISTS audio_popularity_runs`);
  }
}
