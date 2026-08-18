# Popularity Module

Scores every active audio in the library by real-world popularity, so admins can identify what to feature.

**MVP sources:** Open Library + Google Books (both free, no user-facing keys strictly required — one optional free Google Cloud API key recommended).

**For architecture / score formula / code map:** see [`docs/CURRENT_IMPLEMENTATION.md`](./docs/CURRENT_IMPLEMENTATION.md)
**For future sources / pricing / signup URLs:** see [`docs/AVAILABLE_SOURCES.md`](./docs/AVAILABLE_SOURCES.md)

---

# Deployment Runbook (PM2 on dev server)

Assumes:
- Backend is at `/mnt/trl_dev_backend_volume/app`, PM2 process name `trl-backend`, run as user `trl`
- Admin-portal is at `<admin-portal-path>`, PM2 process name `trl-admin-portal`, run as user `trl`
- Python venv at `/mnt/trl_dev_backend_volume/venv` (per Feature 1 setup — this feature adds NO new Python deps)

## Step 1 — Get a free Google Books API key (5 min, recommended)

Without a key, Google Books works but is limited to ~1,000 req/day per IP — first-day scoring of 2,500 audios will hit some skips. With a key you get 1,000/day baseline (easily raised to 100k+/day via a self-service form).

**Steps:**
1. Go to https://console.cloud.google.com/ and either create a new project (`TRL Popularity`) or select an existing one.
2. Enable Books API: https://console.cloud.google.com/apis/library/books.googleapis.com → click **Enable**.
3. Create key: https://console.cloud.google.com/apis/credentials → **+ Create Credentials** → **API key** → **copy the `AIzaSy…` key immediately**.
4. (Optional but recommended) Restrict the key — same page → pencil-edit → **API restrictions** = Books API only → **Application restrictions** = IP addresses → add your dev server's public IP (`curl ifconfig.me` from the dev server).

## Step 2 — Pull latest code + install deps

```bash
# Backend
cd /mnt/trl_dev_backend_volume/app
git fetch origin
git checkout feature/ai_recommendation
git pull origin feature/ai_recommendation
sudo -u trl npm ci                     # no new Python deps for this feature

# Admin portal
sudo -u trl pm2 list                    # confirm admin-portal cwd
cd <admin-portal-path>
git fetch origin
git checkout feature/ai_recommendation
git pull origin feature/ai_recommendation
sudo -u trl npm ci
```

## Step 3 — Set env vars

```bash
sudo -u trl nano /mnt/trl_dev_backend_volume/app/.env
```

Add at the bottom:
```
GOOGLE_BOOKS_API_KEY=AIzaSy...          # paste your key from Step 1
POPULARITY_USER_AGENT="TRL/1.0 (+admin@therentallibrary.com)"
```

`POPULARITY_USER_AGENT` is what we send to Open Library (raises rate limit from 1 → 3 rps — no signup needed, just a string).

**Skipping this step is OK** — feature still works. `GOOGLE_BOOKS_API_KEY` is optional (throttling risk on day-1); `POPULARITY_USER_AGENT` has a sensible default in code.

## Step 4 — Run the migration

```bash
cd /mnt/trl_dev_backend_volume/app
sudo -u trl npm run migration:run
```

Expected last line:
```
Migration CreateAudioPopularity1787000000000 has been executed successfully.
```

**Idempotent** — safe to re-run. Creates 3 new tables (`audio_popularity_scores`, `audio_popularity_history`, `audio_popularity_runs`) and seeds 4 rows in `app_configs` with `ON CONFLICT DO NOTHING`.

**Sanity check (optional, needs psql):**
```bash
psql "$DATABASE_URL" -c "\dt audio_popularity*"
psql "$DATABASE_URL" -c "SELECT key, value FROM app_configs WHERE key LIKE 'popularity_%' ORDER BY key;"
# expect 4 rows: interval_days=1, weight_openlibrary=0.60, weight_google=0.40, min_confidence_display=1
```

## Step 5 — Build backend

```bash
cd /mnt/trl_dev_backend_volume/app
sudo -u trl npm run build
```

## Step 6 — Restart backend under PM2

```bash
sudo -u trl pm2 restart trl-backend --update-env
sudo -u trl pm2 logs trl-backend --lines 100 | grep -iE "popularity|nest.*bootstrap"
```

`--update-env` is mandatory — without it, PM2 keeps the old env and doesn't see `GOOGLE_BOOKS_API_KEY`.

Watch the logs for:
- Normal Nest startup, routes mounted (look for `/admin/popularity`, `/admin/popularity/status`, `/admin/popularity/regenerate`, `/admin/popularity/export`, `/admin/popularity/:sku`)
- Possibly a benign warn line on first boot: `audio_popularity_scores is empty and no successful run recorded. Trigger the first "Refresh Now" from Admin > AI Recommendation > Popularity.`
- **No** `column does not exist`, `ModuleNotFoundError`, or `Failed to load` errors.

Ctrl+C when clean.

## Step 7 — Seed the first popularity batch (CLI, one-shot)

Rather than waiting for the daily 04:00 UTC cron or clicking through the admin UI, run:

```bash
cd /mnt/trl_dev_backend_volume/app
sudo -u trl npm run popularity:seed
```

**Expected output:**
```
[popularity-seed] bootstrapping Nest context (no HTTP server)…
[popularity-seed] starting popularity run (triggered_by=manual)…
[popularity-seed] …still running (30s elapsed)
[popularity-seed] …still running (60s elapsed)
…
📊 Popularity seed result:
   Status:           success
   Batch ID:         <uuid>
   Audios processed: ~2500
   Audios matched:   ~2000+
   Started at:       2026-08-18T18:22:31.123Z
   Completed at:     2026-08-18T18:29:47.891Z
[popularity-seed] ✅ popularity seed completed successfully.
```

Exit code 0 = success; 1 = failure (with reason logged).

**Runtime expectations:**
| Scenario | Duration |
|---|---|
| Cold cache, WITH `GOOGLE_BOOKS_API_KEY` | 5–10 min |
| Cold cache, WITHOUT the key | ~15 min (Google may throttle) |
| Warm cache (24h since last run) | ~30 s |

**Idempotent** — safe to re-run. Each invocation adds a new batch to `audio_popularity_history` and upserts `audio_popularity_scores` on `sku`.

## Step 8 — Build + restart admin-portal

```bash
cd <admin-portal-path>
sudo -u trl npm run build
sudo -u trl pm2 restart trl-admin-portal --update-env
sudo -u trl pm2 logs trl-admin-portal --lines 30
```

Wait for `ready started server on …`, then Ctrl+C.

---

# Testing / Smoke Test

## Step 1 — UI walk-through

Hard-refresh the browser (Ctrl+Shift+R) to bust Next.js asset cache. Then:

1. **Sidebar** — hover **AI Recommendation** → confirm three children: *By Prompt*, *Active-Based List*, *Popularity*.
2. **Configuration page** → scroll to the bottom → new **Popularity** section shows 4 inputs pre-filled: Interval `1`, Min Confidence `1+ source`, Weights (Open Library `0.60`, Google `0.40`).
3. **AI Recommendation → Popularity** page loads:
   - Status card top shows: Status pill, Last Run, Next Scheduled, Interval, Audios Matched (`X / Y`)
   - Amber info card below explains score semantics (all-time cultural relevance, not trending today)
   - Filter card (Min Score, Max Score, Min Confidence, Search)
   - Table of ranked audios: **Cover, SKU, Title, Authors, Popularity (score badge + confidence dots + tooltip), Last Computed**
   - **Download CSV** and **Refresh Now** buttons at top-right

## Step 2 — Sanity-check a specific audio

Get one SKU from the table, then check via API:
```bash
curl -H "Authorization: Bearer <admin-token>" \
  "https://<dev-admin-url>/api/v1/admin/popularity/<SKU>" | jq
```

Response contains `sources.openlibrary` and `sources.google` with:
- `matched: true/false`
- `sub_score` (0-100)
- `weight` (from app_configs)
- `raw` — actual API evidence (reading_log_count for OL; average_rating + ratings_count for Google) + `matched_by: "isbn" | "title_author"`

Hovering the popularity badge in the UI shows the same breakdown as a tooltip.

## Step 3 — Test manual regenerate + polling

1. Click **Refresh Now** on the Popularity page.
2. Toast: *"Popularity refresh started"*. Status pill flips to `Running`.
3. UI polls status every 5 s. Progress logs on the backend:
   ```bash
   sudo -u trl pm2 logs trl-backend --lines 500 | grep -iE "Popularity|OpenLibrary|GoogleBooks"
   ```
4. When done, status flips to `Success`; toast: *"Popularity refresh complete — X of Y audios matched"*. Table auto-reloads.
5. Try clicking **Refresh Now** twice quickly → second call returns 409 (`ConflictException` — single-flight mutex). No new row created.

## Step 4 — Test filters

On the Popularity page:
1. Set **Min Score = 70**, click Apply → only high-popularity audios shown.
2. Set **Min Confidence = 2+ sources** → only audios where BOTH OL and Google matched. Confirms confidence-based filtering works.
3. Type a title in the search box, click Apply → results narrow.
4. Click **Clear** → filters reset, full list shown again.

## Step 5 — Verify config changes take effect

1. Configuration → change **Source Weight — Open Library** from `0.60` to `0.90` → Save.
2. Popularity page → **Refresh Now**.
3. When done, spot-check a row: the popularity score should have moved (up if the audio's OL sub-score was higher than the Google one, down if lower).
4. Check DB:
   ```sql
   SELECT sku, popularity_score, source_weights_version
   FROM audio_popularity_scores
   ORDER BY computed_at DESC LIMIT 5;
   ```
   The `source_weights_version` column should now include `openlibrary=0.9`.
5. Restore weights afterwards.

## Step 6 — Verify cron is registered

```bash
sudo -u trl pm2 logs trl-backend --lines 200 | grep -iE "Cron|popularity_tick"
```

Expect a NestJS log line registering `popularity_tick`. Fires at 04:00 UTC daily; checks the interval config and either runs or skips silently.

## Step 7 — CSV export

Click **Download CSV** on the Popularity page → a file `popularity_scores_YYYY-MM-DD.csv` downloads with columns: `SKU, Title, Popularity Score, Confidence, Computed At`, sorted by score descending.

---

# Troubleshooting

| Symptom | Fix |
|---|---|
| `Refresh Now` gives 409 | A run is in-flight — wait, or `sudo -u trl pm2 restart trl-backend` to kill the child |
| Status stays `Running` > 30 min | Tail logs — check for rate-limit failures. Circuit breaker will trip after 5 consecutive failures per source and skip that source. 3-hour hard timeout is the ultimate ceiling. |
| Confidence for most audios is 1, not 2 | One source is under-matching. Check backend logs for `NytBooksFetcher`/`OpenLibrary` warnings. Common causes: `GOOGLE_BOOKS_API_KEY` not set (Google throttles); or `POPULARITY_USER_AGENT` not set (Open Library at 1 rps instead of 3). |
| All audios get score 0 | Sources both returning null. Verify with a direct curl to `openlibrary.org/search.json?q=isbn:<known-good-isbn>&fields=readinglog_count&limit=1` from the dev server. |
| `Refresh Now` fails with 500 | Check backend logs. Common: DB migration not applied (`table "audio_popularity_scores" does not exist`) — run Step 4 again. |
| Cron never fires | Check `sudo -u trl pm2 logs trl-backend` at 04:00 UTC. Also verify the interval hasn't elapsed already (scheduler skips silently if `now - last_success < interval_days`). |
| Config page won't save | Zod validation error on new Popularity fields (they all require values). If seed didn't run, DB has no rows for those keys — check with the SELECT in Step 4. |

---

# Rollback

```bash
cd /mnt/trl_dev_backend_volume/app
git checkout <previous-commit-hash>
sudo -u trl npm ci && sudo -u trl npm run build
sudo -u trl npm run migration:rollback        # drops the 3 new tables; app_configs rows preserved
sudo -u trl pm2 restart trl-backend --update-env

cd <admin-portal-path>
git checkout <previous-commit-hash>
sudo -u trl npm ci && sudo -u trl npm run build
sudo -u trl pm2 restart trl-admin-portal --update-env
```

Rollback keeps the 4 `popularity_*` rows in `app_configs` (harmless when the tables aren't there; ready to go if you re-apply).

---

# See also

- [`docs/CURRENT_IMPLEMENTATION.md`](./docs/CURRENT_IMPLEMENTATION.md) — architecture, score formula, file map, config knobs, resilience details
- [`docs/AVAILABLE_SOURCES.md`](./docs/AVAILABLE_SOURCES.md) — every popularity source we evaluated, pricing URLs, signup steps, roadmap for future additions
