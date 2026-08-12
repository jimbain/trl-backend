import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One-time cleanup for the accumulated duplicate `user_devices` rows that were
 * causing users to receive the same push notification multiple times
 * simultaneously.
 *
 * Root cause (fixed in code): `storeUserDevice` deduped only by
 * `(user_id, device_id)`. If the mobile client ever produced a different
 * `device_id` for the same install (iOS IDFV rotates on reinstall; Android
 * install-id can rotate) a new row was created carrying the SAME `fcm_key` as
 * the old row — both `is_active=true` — so the scheduler pushed to the same
 * FCM token N times.
 *
 * This migration is DATA-ONLY. It does not add or alter any columns/indexes.
 * It is idempotent (safe to run multiple times) and non-destructive (rows are
 * flipped to `is_active=false`, never deleted).
 *
 * Runs two cleanups in-order inside a single transaction:
 *   1. Within a user: for each (user_id, fcm_key), keep only the newest
 *      `is_active=true` row.
 *   2. Across users: for each fcm_key, keep only the newest `is_active=true`
 *      row (a token belongs to exactly one user at a time — the newest login
 *      wins). Prevents cross-user notification leaks.
 *
 * The `down()` intentionally cannot restore the previous `is_active` values —
 * that state was already broken and by design we do not want to re-enable
 * duplicates.
 */
export class CleanupDuplicateUserDevices1780000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: within-user duplicates (same user_id + same fcm_key,
    // multiple is_active=true rows).
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY user_id, fcm_key
                 ORDER BY updated_at DESC, id DESC
               ) AS rn
          FROM user_devices
         WHERE is_active = true
           AND fcm_key IS NOT NULL
           AND fcm_key <> ''
      )
      UPDATE user_devices
         SET is_active = false,
             updated_at = NOW()
       WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    `);

    // Step 2: cross-user duplicates (same fcm_key held by multiple users).
    // Newest row wins — that user is the current owner of the physical device.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY fcm_key
                 ORDER BY updated_at DESC, id DESC
               ) AS rn
          FROM user_devices
         WHERE is_active = true
           AND fcm_key IS NOT NULL
           AND fcm_key <> ''
      )
      UPDATE user_devices
         SET is_active = false,
             updated_at = NOW()
       WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    `);

    // Step 3: deactivate rows with empty / null fcm_key — they cannot receive
    // pushes anyway and their presence causes false-positive "active device"
    // counts.
    await queryRunner.query(`
      UPDATE user_devices
         SET is_active = false,
             updated_at = NOW()
       WHERE is_active = true
         AND (fcm_key IS NULL OR fcm_key = '');
    `);
  }

  public async down(): Promise<void> {
    // Intentionally a no-op. This migration only deactivates rows that were
    // already duplicates and would have caused user-visible duplicate pushes.
    // Restoring the pre-migration state would re-introduce the bug.
  }
}
