# Popularity Module

Scores every **active** audio in the library by real-world popularity, so admins can identify what to feature.

**Source:** Open Library only — free, no key, no signup.

> Google Books was removed in the `fix(popularity)` work after live testing: it matched **0 of 2,025** titles across 37 consecutive nightly runs. The cause is that its field operators (`isbn:`, `intitle:`, `inauthor:`) return `totalItems: 0` for our catalogue even with a valid key, and the free-text fallback mismatched 1 in 3 titles (e.g. *The Art of Creativity* → *Catalog of Copyright Entries*). Its daily quota (1,000) was also a quarter of what one run needs. See git history for `google-books.fetcher.ts`.

**For architecture / score formula / code map:** see [`docs/CURRENT_IMPLEMENTATION.md`](./docs/CURRENT_IMPLEMENTATION.md)
**For future sources / pricing / signup URLs:** see [`docs/AVAILABLE_SOURCES.md`](./docs/AVAILABLE_SOURCES.md)

---

# Deployment Runbook (PM2 on dev server)

Assumes:
- Backend at `/mnt/trl_dev_backend_volume/app`, PM2 process `trl-backend`, run as user `trl`, branch `dev`
- Admin-portal at `<admin-portal-path>` (get it from `pm2 list`), PM2 process `trl-admin-portal`, branch `development`
- Python venv at `/mnt/trl_dev_backend_volume/venv` — this feature adds **no** Python deps

## Step 1 — Pull latest code + install deps

```bash
# Backend
cd /mnt/trl_dev_backend_volume/app
sudo -u trl git fetch origin
sudo -u trl git checkout dev
sudo -u trl git pull --ff-only origin dev
sudo -u trl npm ci

# Admin portal
sudo -u trl pm2 list                    # confirm admin-portal cwd
cd <admin-portal-path>
sudo -u trl git fetch origin
sudo -u trl git checkout development
sudo -u trl git pull --ff-only origin development
sudo -u trl npm ci
```

`--ff-only` so a diverged local checkout fails loudly instead of opening a merge.

## Step 2 — Env vars

Only one is read by this module:

```
POPULARITY_USER_AGENT="TRL/1.0 (+admin@therentallibrary.com)"
```

Open Library raises its rate limit from 1 → 3 rps for callers that identify themselves. **Optional** — [`open-library.fetcher.ts`](./services/fetchers/open-library.fetcher.ts) falls back to exactly this string, so setting it changes no behaviour. Keep it in `.env` anyway: it puts the contact address somewhere an operator can change without a deploy.

**`GOOGLE_BOOKS_API_KEY` is dead — delete the line.** Nothing reads it. If a key was ever issued, revoke it in the Google Cloud console rather than leaving a live credential in a `.env`.

## Step 3 — Run migrations

```bash
cd /mnt/trl_dev_backend_volume/app
sudo -u trl npm run build          # migration:run reads dist/, not src/
sudo -u trl npm run migration:run
```

The build is **not optional**: [`data_source.ts`](../database/data_source.ts) globs `dist/database/migrations/*.js`. Skipping it reports `No migrations are pending` on a database that is in fact behind.

Two migrations belong to this module:

| Migration | Effect |
|---|---|
| `CreateAudioPopularity1787000000000` | Creates `audio_popularity_scores`, `audio_popularity_history`, `audio_popularity_runs`; seeds 3 `app_configs` rows with `ON CONFLICT DO NOTHING` |
| `PopularityNullableScoreAndSourceCounts1788000000000` | Drops `NOT NULL` on `popularity_score` in both score tables, converts existing `confidence = 0` rows to `NULL`, adds `source_match_counts jsonb` to the runs table |

Both are idempotent and safe to re-run.

**If `npm run build` fails with `EACCES: permission denied, rmdir .../dist/...`**, a previous build ran as root. Fix the ownership before retrying — do not run the build as root:

```bash
sudo chown -R trl:trl /mnt/trl_dev_backend_volume/app/dist
```

**Sanity check:**
```bash
psql "$DATABASE_URL" -c "\dt audio_popularity*"
psql "$DATABASE_URL" -c "SELECT key, value FROM app_configs WHERE key LIKE 'popularity_%' ORDER BY key;"
# expect exactly 3 rows:
#   popularity_interval_days             = 1
#   popularity_min_confidence_display    = 1
#   popularity_source_weight_openlibrary = 1.00

psql "$DATABASE_URL" -c "SELECT is_nullable FROM information_schema.columns
  WHERE table_name = 'audio_popularity_scores' AND column_name = 'popularity_score';"
# expect YES — 1788 has run
```

There is no `popularity_source_weight_google` row. If one is present the database predates the Google removal; it is inert (no fetcher claims it) but delete it so the Configuration page's weight set matches the fetcher set.

## Step 4 — Restart backend

```bash
cd /mnt/trl_dev_backend_volume/app
sudo -u trl pm2 restart trl-backend --update-env
sudo -u trl pm2 logs trl-backend --lines 100 | grep -iE "popularity|nest.*bootstrap|cron"
```

`--update-env` is mandatory — without it PM2 keeps the environment from the previous start and never sees `.env` edits.

Watch for:
- Normal Nest startup with the popularity routes mounted: `/admin/popularity`, `/admin/popularity/status`, `/admin/popularity/regenerate`, `/admin/popularity/export`, `/admin/popularity/:sku`
- `popularity_tick` cron registered
- Possibly benign on a fresh database: `audio_popularity_scores is empty and no successful run recorded.`
- **No** `column does not exist`, `ModuleNotFoundError`, or `Failed to load`

A `column "source_match_counts" does not exist` here means Step 3 did not actually migrate — almost always the skipped build.

## Step 5 — Seed the first batch (CLI, one-shot)

Faster than waiting for the 04:00 UTC cron or clicking through the UI:

```bash
cd /mnt/trl_dev_backend_volume/app
sudo -u trl npm run popularity:seed
```

**Expected output:**
```
[popularity-seed] bootstrapping Nest context (no HTTP server)…
[popularity-seed] starting popularity run (triggered_by=manual)…
[popularity-seed] …still running (30s elapsed)
…
📊 Popularity seed result:
   Status:           success
   Batch ID:         <uuid>
   Audios processed: ~2000
   Audios matched:   ~900
   Started at:       …
   Completed at:     …
[popularity-seed] ✅ popularity seed completed successfully.
```

**`Audios matched` is expected to be roughly half of `processed`.** Open Library covers the trade/literary catalogue well and Christian, academic and small-press titles poorly. The unmatched ones are stored with `popularity_score = NULL` and `confidence = 0` — *unmeasured*, not unpopular — and the UI renders them as **No data**. A score of `0` would mean a source looked and found nothing notable; nothing currently produces that.

**If the status is `partial`** the run completed and committed a batch, but a source matched **zero** titles across the whole catalogue, which is a broken fetcher rather than an unlucky night. The exit code is still 0 so a deploy isn't blocked, but fix it before trusting the scores:

```bash
psql "$DATABASE_URL" -c "SELECT status, source_match_counts, audios_processed
  FROM audio_popularity_runs ORDER BY started_at DESC LIMIT 1;"
```

Then curl Open Library directly from the dev server (Step "All titles show No data" in Troubleshooting).

**Runtime:** ~10–15 min cold, ~30 s warm (24h cache). Idempotent — each run appends a batch to `audio_popularity_history` and upserts `audio_popularity_scores` on `sku`.

## Step 6 — Build + restart admin-portal

```bash
cd <admin-portal-path>
sudo -u trl npm run build
sudo -u trl pm2 restart trl-admin-portal --update-env
sudo -u trl pm2 logs trl-admin-portal --lines 30
```

Wait for `ready started server on …`, then Ctrl+C.

## Step 7 — Elasticsearch

The runner syncs the scored audios itself after every run, so a normal deploy needs nothing here.

**One exception:** if you ran migration 1788 against a database whose rows were already scored, the index still holds `popularity_score: 0` for the rows the migration turned into `NULL`, and the admin audio list reads `hit._source`. The next popularity run fixes it; to fix it immediately, re-run the seed (Step 5) — it rewrites every scored document.

---

# Testing / Smoke Test

## Step 1 — UI walk-through

Hard-refresh (Ctrl+Shift+R) to bust the Next.js asset cache. Then:

1. **Sidebar** — hover **AI Recommendation** → three children: *By Prompt*, *Active-Based List*, *Popularity*.
2. **Configuration page** → bottom → **Popularity** section with 3 inputs pre-filled: Interval `1`, Min Confidence `1+ source`, Source Weight — Open Library `1.00`. There is no Google weight input.
3. **AI Recommendation → Popularity** loads:
   - Status card: Status pill, Last Run, Next Scheduled, Interval, Audios Matched (`X / Y`) with the per-source tally beneath it (`openlibrary: 917`)
   - Amber info card explaining score semantics (all-time cultural relevance, not trending today)
   - Filters: Min Score, Max Score, Min Confidence, Search
   - Table: Cover, SKU, Title, Authors, Popularity (score badge + confidence dots + tooltip, or **No data**), Last Computed
   - **Download CSV** and **Refresh Now** top-right

**Scored titles must sort above `No data` ones.** Postgres sorts `NULL` first on `DESC`, so [`popularity.service.ts`](./services/popularity.service.ts) pins `NULLS LAST`. If page 1 is a wall of **No data**, that ordering regressed.

## Step 2 — Sanity-check a specific audio

```bash
curl -H "Authorization: Bearer <admin-token>" \
  "https://<dev-admin-url>/api/v1/admin/popularity/<SKU>" | jq
```

`sources.openlibrary` carries `matched`, `sub_score` (0-100), `weight`, and `raw` — the actual evidence (`reading_log_count`, plus `matched_by: "isbn" | "title_author"`). There is no `sources.google`. Hovering the badge in the UI shows the same breakdown.

For an unmatched title, `popularity_score` is `null` and `sources.openlibrary.matched` is `false`.

## Step 3 — Manual regenerate + polling

1. **Refresh Now** → toast *"Popularity refresh started"*, pill flips to `Running`.
2. UI polls every 5 s. Backend progress:
   ```bash
   sudo -u trl pm2 logs trl-backend --lines 500 | grep -iE "Popularity|OpenLibrary"
   ```
   Progress lines include the live per-source tally: `progress: 500/2025 (matched=220, {"openlibrary":220})`.
3. On completion the pill flips to `Success` (or amber `Partial`), a toast reports `X of Y matched`, and the table reloads.
4. Click **Refresh Now** twice quickly → the second returns 409 (`ConflictException`, single-flight mutex) and creates no row.

## Step 4 — Filters

1. **Min Score = 70** → Apply → only high-popularity titles. Note `No data` rows disappear: `popularity_score >= 70` excludes `NULL`, which is correct — an unmeasured title does not satisfy a score floor.
2. **Min Confidence = 1+ source** → only measured titles. With one source, confidence is 0 or 1, so `2+` and `3+` legitimately return nothing.
3. Search a title → Apply → narrows.
4. **Clear** → full list.

## Step 5 — Verify config changes take effect

With a single source at weight `1.00`, the weighted average equals the Open Library sub-score, so **changing the weight alone will not move any score** — it cancels out of numerator and denominator. Verify the plumbing instead of the arithmetic:

1. Configuration → set **Source Weight — Open Library** to `0.50` → Save.
2. Popularity page → **Refresh Now**.
3. Check that the new weight was recorded:
   ```sql
   SELECT sku, popularity_score, source_weights_version
   FROM audio_popularity_scores
   ORDER BY computed_at DESC LIMIT 5;
   ```
   `source_weights_version` should read `openlibrary=0.5` while `popularity_score` is unchanged. **That is the correct result.**
4. Setting the weight to `0` is the real behavioural test: the source stops contributing, every score becomes `NULL`, and the run is marked `partial`. Restore to `1.00` and re-run afterwards.

## Step 6 — Verify cron is registered

```bash
sudo -u trl pm2 logs trl-backend --lines 200 | grep -iE "Cron|popularity_tick"
```

`popularity_tick` fires at **04:00 UTC daily** (`@Cron('0 4 * * *')`), checks `popularity_interval_days` against the last completed run, and either runs or skips silently.

A `partial` run counts as completed for that gate (`COMPLETED_RUN_STATUSES`). If it did not, the scheduler would never see its own last run and would re-trigger the full job on every tick.

## Step 7 — CSV export

**Download CSV** → `popularity_scores_YYYY-MM-DD.csv` with `SKU, Title, Popularity Score, Confidence, Computed At`, score descending. Unmeasured titles appear last with an **empty** Popularity Score cell — not `0`, and not the text `null`.

---

# Troubleshooting

| Symptom | Fix |
|---|---|
| `Refresh Now` gives 409 | A run is in-flight — wait, or `sudo -u trl pm2 restart trl-backend` to kill the child |
| Status stays `Running` > 30 min | Tail logs for rate-limit failures. The circuit breaker trips after 5 consecutive failures per source and skips it; the 3-hour hard timeout is the ceiling |
| Run status is `Partial` | A source matched 0 titles catalogue-wide. `SELECT source_match_counts FROM audio_popularity_runs ORDER BY started_at DESC LIMIT 1` names it. Then curl that source directly from the dev server |
| About half of titles show **No data** | Expected. Open Library covers trade/literary well, Christian/academic/small-press poorly. Confirm the proportion is stable run-to-run, not growing |
| **All** titles show **No data** | Open Library is unreachable or the fetcher is broken. Verify from the dev server: `curl -A "TRL/1.0 (+admin@therentallibrary.com)" "https://openlibrary.org/search.json?q=isbn:9780441013593&fields=readinglog_count&limit=1"`. Also check `popularity_source_weight_openlibrary` is not `0` — weight 0 produces NULL for everything |
| Page 1 is all **No data** | `NULLS LAST` was lost from the list ordering. Postgres sorts NULL first on `DESC` |
| CSV cells read `null` | The export is interpolating the value directly instead of `?? ''` |
| `Refresh Now` fails with 500 | Usually an unapplied migration — `table "audio_popularity_scores" does not exist` or `column "source_match_counts" does not exist`. Redo Step 3, build included |
| `No migrations are pending` but the schema is old | `npm run build` was skipped. `data_source.ts` reads `dist/`, not `src/` |
| Cron never fires | Check logs at 04:00 UTC. The scheduler skips silently when `now - last_completed < interval_days` |
| Config page won't save | Zod requires values for all Popularity fields. If the seed never ran, those `app_configs` rows are missing — check with the SELECT in Step 3 |

---

# Rollback

Code rolls back cleanly. **The data migration does not fully reverse:** `down()` on 1788 must set `popularity_score = 0` to restore `NOT NULL`, which re-creates the exact unmeasured/unpopular conflation the migration removed. The distinction survives in `confidence = 0`, so re-running `up()` restores it — but avoid a round trip unless the schema change is itself the problem.

```bash
cd /mnt/trl_dev_backend_volume/app
sudo -u trl git checkout <previous-commit-hash>
sudo -u trl npm ci && sudo -u trl npm run build
sudo -u trl npm run migration:rollback        # reverts 1788 only — one step per invocation
sudo -u trl pm2 restart trl-backend --update-env

cd <admin-portal-path>
sudo -u trl git checkout <previous-commit-hash>
sudo -u trl npm ci && sudo -u trl npm run build
sudo -u trl pm2 restart trl-admin-portal --update-env
```

To drop the tables as well, run `migration:rollback` a second time to revert 1787. `app_configs` rows are preserved either way.
