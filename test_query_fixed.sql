-- BEFORE: Buggy query that causes identical listen times across users
-- Issue: Missing user_id filter, causing aggregation across ALL users

SELECT
  log.id,
  log.user_id,
  log.item_id,
  log.item_type,
  log.action,
  (
    SELECT COALESCE(SUM((sub_log.meta->>'total_time_played')::bigint), 0)
    FROM user_activity_logs sub_log
    WHERE sub_log.action = 'play'
    AND sub_log.item_id = log.item_id        -- ❌ BUG: Missing user_id!
    AND sub_log.item_type = log.item_type
    AND (
      CASE
        WHEN log.action IN ('rent', 'renew') THEN
          sub_log.created_at BETWEEN
            (log.meta->>'start_time')::timestamp AND
            (log.meta->>'end_time')::timestamp
        WHEN log.action = 'keep' THEN
          sub_log.created_at > (log.meta->>'keep_at')::timestamp
        ELSE FALSE
      END
    )
  ) AS listened_time_ms_OLD
FROM user_activity_logs log
WHERE log.action IN ('rent', 'keep', 'renew');

-- AFTER: Fixed query with proper user filtering and media type handling
-- Fixes:
-- 1. Added user_id filter (line 47)
-- 2. Handle both 'play' and 'video_player_event' actions (line 50)
-- 3. Convert seconds to milliseconds properly (lines 44-48)
-- 4. Improved date filtering logic (line 54-57)

SELECT
  log.id,
  log.user_id,
  log.item_id,
  log.item_type,
  log.action,
  (
    SELECT COALESCE(
      SUM(
        CASE
          -- Audio and Pharma: total_time_played is in SECONDS, convert to MS
          WHEN sub_log.action = 'play' THEN
            (sub_log.meta->>'total_time_played')::numeric * 1000
          -- Video: play_position is in SECONDS, convert to MS
          WHEN sub_log.action = 'video_player_event' AND sub_log.meta->>'event' = 'play' THEN
            (sub_log.meta->>'play_position')::numeric * 1000
          ELSE 0
        END
      ), 0
    ) AS total_time_played_sum_ms
    FROM user_activity_logs sub_log
    WHERE sub_log.user_id = log.user_id       -- ✅ FIX #1: Filter by user_id
    AND sub_log.item_id = log.item_id
    AND sub_log.item_type = log.item_type
    AND sub_log.action IN ('play', 'video_player_event')  -- ✅ FIX #2: Handle video events
    AND (
      CASE
        WHEN log.action IN ('rent', 'renew') THEN
          -- ✅ FIX #3: Use >= instead of BETWEEN, fallback to log.created_at if start_time is NULL
          sub_log.created_at >= COALESCE(
            (log.meta->>'start_time')::timestamp,
            log.created_at
          )
        WHEN log.action = 'keep' THEN
          -- ✅ FIX #4: Use >= instead of >
          sub_log.created_at >= (log.meta->>'keep_at')::timestamp
        ELSE FALSE
      END
    )
  ) AS listened_time_ms_FIXED
FROM user_activity_logs log
WHERE log.action IN ('rent', 'keep', 'renew')
ORDER BY log.item_id, log.user_id;

-- TEST CASE: Show the difference
-- Run this to see how 3 users listening to same book now get individual times
-- instead of the same aggregated time

/*
Example BEFORE fix:
user_id | item_id | listened_time_ms_OLD
--------|---------|---------------------
user_A  | book_1  | 9765000  (all 3 users combined!)
user_B  | book_1  | 9765000  (all 3 users combined!)
user_C  | book_1  | 9765000  (all 3 users combined!)

Example AFTER fix:
user_id | item_id | listened_time_ms_FIXED
--------|---------|------------------------
user_A  | book_1  | 3255000  (only user_A's time)
user_B  | book_1  | 3255000  (only user_B's time)
user_C  | book_1  | 3255000  (only user_C's time)
*/
