import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two corrections to the popularity schema.
 *
 * ── 1. An unmeasured title is NULL, not 0 ───────────────────────────────────
 * `popularity_score smallint NOT NULL` forced every title no source could
 * match to be stored as 0. On dev that is 1,108 of 1,976 active titles — 56% —
 * sitting at the bottom of the Popularity column indistinguishable from titles
 * that genuinely nobody reads. Admins use that column to decide what to
 * license, so "we have no data" reading as "this is unpopular" is not a
 * cosmetic problem.
 *
 * `confidence` stays NOT NULL: 0 matched sources is a true, meaningful count,
 * and the Popularity page's min-confidence filter depends on it.
 *
 * Existing rows where confidence = 0 are converted, because they were never
 * measurements — they are the absence of one.
 *
 * ── 2. A dead source has to be able to announce itself ──────────────────────
 * Google Books matched 0 of 2,025 titles for 37 consecutive nights and every
 * one of those runs recorded `success`. Now that Open Library is the only
 * source the failure mode is binary: if it breaks, runs still report success
 * with audios_matched = 0 and nobody finds out until someone opens the page.
 *
 * `source_match_counts` stores {source: matched_rows} per run, so the run log
 * shows which source produced what. The runner marks a run `partial` when a
 * configured source contributes nothing — see PopularityRunnerService.
 *
 * Written as a separate migration rather than an edit to 1787 because that one
 * has already run on dev; editing it would fix production and silently leave
 * dev on the old shape.
 */
export class PopularityNullableScoreAndSourceCounts1788000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'audio_popularity_scores',
      'audio_popularity_history',
    ]) {
      await queryRunner.query(
        `ALTER TABLE ${table} ALTER COLUMN popularity_score DROP NOT NULL`,
      );
      // Only rows that matched nothing. A score of 0 from a source that DID
      // match is a real measurement and must survive.
      await queryRunner.query(
        `UPDATE ${table} SET popularity_score = NULL WHERE confidence = 0`,
      );
    }

    await queryRunner.query(
      `ALTER TABLE audio_popularity_runs
         ADD COLUMN IF NOT EXISTS source_match_counts jsonb`,
    );
  }

  /**
   * Reversible, with one unavoidable loss: NULL scores have to become 0 again
   * to restore NOT NULL, which is the very conflation this migration removes.
   * Re-running up() restores them, since the distinction is recoverable from
   * confidence = 0.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE audio_popularity_runs DROP COLUMN IF EXISTS source_match_counts`,
    );

    for (const table of [
      'audio_popularity_scores',
      'audio_popularity_history',
    ]) {
      await queryRunner.query(
        `UPDATE ${table} SET popularity_score = 0 WHERE popularity_score IS NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE ${table} ALTER COLUMN popularity_score SET NOT NULL`,
      );
    }
  }
}
