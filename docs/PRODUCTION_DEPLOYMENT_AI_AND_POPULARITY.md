# Production Deployment — AI Recommendations + Popularity

Deploys `backend/dev` → `backend/production` and `admin-portal/development` →
`admin-portal/production`, adding: the three AI columns on `audios`, the AI
recommendation pipeline (FAISS + Ollama), and the Popularity module.

**Scope:** 51 backend commits / 67 files / +8,936 lines, and 16 portal commits
/ 33 files / +2,928 lines. Four new database migrations.

---

## The two phases, and why they are separate

**Phase 1 (this deploy).** Code, migrations, Elasticsearch, popularity. When it
finishes, `ai_embedding`, `ai_categories` and `AI_Class_Vector` exist on prod
and are **completely empty**. The FAISS index is therefore empty and
prompt-based AI recommendations return no results. That is expected, not a
failure.

Python and Ollama are installed in Phase 1 (Steps 1 and 2) so the recommender
is live and idle, holding an empty index, from day one. That is what lets
Phase 2 be a pure data job finished with the admin panel's reindex button.

**Phase 2 (later, after the AI developer finishes the dev fill).**
`trl-migration/scripts/14_sync_ai_columns_dev_to_prod.py` copies the column
values dev → prod in resumable batches, syncing prod Elasticsearch as it goes.
Then the reindex button in the admin panel loads them into FAISS and
recommendations come alive.

Popularity does **not** depend on either phase — it only needs Open Library —
so it can be seeded and verified on the day of Phase 1.

Phases are split because the vectors are ~6 GB of data and the fill is still in
progress upstream. Deploying the schema now means Phase 2 is a data job with no
code risk attached to it.

---

## Verified starting state of production

Checked directly against `trl-db-live-…/trl_db` before writing this document:

| | Production | Dev (for comparison) |
|---|---|---|
| PostgreSQL | **18.6** | 16.15 |
| pgvector | **available 0.8.6, NOT installed** | installed 0.8.1 |
| `audios` rows | 1,421,121 | 1,422,365 |
| active / excluded | 2,157 / 400 | 2,024 / 2,152 |
| Last migration | `CleanupDuplicateUserDevices1780000000000` | `…1788000000000` |
| AI columns | **absent** | present |
| `audio_popularity_*` tables | **absent** | present |
| Database size | 6,858 MB | — |
| `audios` table size | 2,059 MB | — |
| `maintenance_work_mem` | 266 MB (settable to 2 GB per session) | 266 MB |
| `shared_buffers` | 780 MB | 780 MB |
| Elasticsearch | `es.trainingresourcelibrary.com` | `159.203.4.73.nip.io:9200` |

Two results worth stating explicitly because they were uncertain and are now
not:

- **`TRLDevdec` is not a superuser but *can* install pgvector.** Tested by
  running `CREATE EXTENSION vector` inside a transaction and rolling back;
  it succeeded, reported 0.8.6, and the cosine operator worked. Migration 1785
  will therefore not fail on permissions.
- **Prod and dev use different Elasticsearch clusters.** Nothing done to dev's
  index affects prod's; prod's index must be updated on its own.

**Pending migrations (4):**

```
1785000000000-add_ai_columns_to_audios
1786000000000-create_ai_active_recommendations
1787000000000-create_audio_popularity
1788000000000-popularity_nullable_score_and_source_counts
```

They must run in that order. 1786 asserts that `audios."AI_Class_Vector"`
exists and aborts if it does not, so 1785 cannot be skipped.

---

## Step 0 — Two capacity checks to do BEFORE anything else

These are the only things in this deployment that can fail in a way that is
painful to undo. Both are about Phase 2, but you want the answer now, because
if either is short the plan changes.

### 0a. Database disk

Phase 2 adds, measured from dev:

| Item | Size |
|---|---|
| `ai_embedding` | 1,990 MB |
| `AI_Class_Vector` | 3,977 MB |
| `ai_categories` | 74 kB |
| HNSW index on `AI_Class_Vector` | 4,824 MB |
| **Subtotal** | **~10.8 GB** |

On top of a current 6,858 MB that is **~17.7 GB steady state**. During the copy
itself, add transient bloat: every `UPDATE` writes a new row version, so filling
1.35M rows rewrites the 2 GB `audios` table and leaves up to that much in dead
tuples until autovacuum catches up. **Budget ~22 GB peak.**

Check the plan's disk in the DigitalOcean console. If it is under ~30 GB, resize
before Phase 2 — a managed Postgres that hits its disk limit goes read-only, and
recovering means a resize anyway, just with an outage attached.

### 0b. Application server RAM

Once vectors are populated, `recommender.py` holds a `faiss.IndexHNSWFlat`
resident for the lifetime of the backend process. At the full 1.35M vectors:

| Item | RAM |
|---|---|
| Vectors (1,355,421 × 768 × 4 B, flat float32) | ~4.1 GB |
| HNSW graph links (M = 32) | ~0.4 GB |
| `sentence-transformers` + torch + bge-base | ~1.2 GB |
| **Python total** | **~5.7 GB** |

Plus Node. **On an 8 GB box this is tight enough to matter.** The build itself
is safe — vectors are added in batches of 10,000 so peak build RAM is ~92 MB
over steady state — but steady state is the problem.

Dev has already been OOM-killed by this once, at a third of the vector count,
when a second Python child was accidentally spawned. So:

- Confirm the prod box has **≥ 8 GB**, and prefer 16 GB if the full fill is the
  goal.
- Make sure only **one** backend process runs. `pm2 list` should show exactly
  one instance, and no stray root-owned `node dist/main` — that exact situation
  on dev fired every cron twice and OOM-killed the recommender.

---

## Step 1 — Install Python 3 and the AI dependencies

Run as the deploy user (`trl` in these examples — confirm yours from
`pm2 list`). Substitute the real application path for `<APP_PATH>`.

```bash
sudo apt-get update
sudo apt-get install -y python3 python3-venv python3-pip build-essential

python3 --version        # 3.10+ is fine; 3.11/3.12 preferred
```

Create the venv **outside** the git working tree so a deploy never clobbers it:

```bash
sudo mkdir -p /opt/trl-ai
sudo chown trl:trl /opt/trl-ai
sudo -u trl python3 -m venv /opt/trl-ai/venv

sudo -u trl /opt/trl-ai/venv/bin/pip install --upgrade pip
sudo -u trl /opt/trl-ai/venv/bin/pip install -r <APP_PATH>/src/ai/scripts/requirements.txt
```

`requirements.txt` pins:

```
sentence-transformers==2.7.0
faiss-cpu==1.8.0
psycopg2-binary==2.9.9
numpy==1.26.4
pgvector==0.3.6
requests>=2.31
```

Verify, and note that this is a ~2.5 GB install mostly from torch:

```bash
sudo -u trl /opt/trl-ai/venv/bin/python -c \
  "import faiss, numpy, psycopg2, pgvector, sentence_transformers as st; \
   print('faiss', faiss.__version__); print('st', st.__version__)"
```

### Pre-download the embedding model

`BAAI/bge-base-en-v1.5` is ~440 MB and is fetched from Hugging Face on first
use. Do it now, as the service user, so the first recommendation request is not
a cold download — and so you find out about egress restrictions here rather
than at 03:00:

```bash
sudo -u trl HF_HOME=/opt/trl-ai/hf /opt/trl-ai/venv/bin/python -c \
  "from sentence_transformers import SentenceTransformer; \
   m = SentenceTransformer('BAAI/bge-base-en-v1.5'); \
   print('dims', m.get_sentence_embedding_dimension())"
```

Expect `dims 768`. If it prints anything else, stop — the column is
`vector(768)` and a mismatch will fail every insert.

Set `HF_HOME` in the backend's environment too (Step 4), or the service will
re-download into whatever home directory PM2 happens to give it.

---

## Step 2 — Install Ollama and pull the model

Ollama is needed **only** for `ai_categories` generation (the nightly
`AI_BACKFILL_CATEGORIES_CRON` job). Prompt recommendations and ranking do not
touch it. You can defer this entire step if you are copying `ai_categories`
from dev in Phase 2 and not generating any on prod.

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl enable --now ollama
sudo systemctl status ollama --no-pager | head -5

ollama pull qwen2.5:1.5b          # ~1 GB
curl -s http://localhost:11434/api/tags | head -c 300
```

Keep it bound to localhost — it has no authentication. The install script
defaults to `127.0.0.1:11434`; if anything has set `OLLAMA_HOST=0.0.0.0`,
change it back.

Quick functional check:

```bash
curl -s http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5:1.5b","prompt":"Reply with the single word OK.","stream":false}' \
  | head -c 200
```

**Memory note:** qwen2.5:1.5b is another ~1.5–2 GB resident while loaded. Added
to the ~5.7 GB of FAISS + model from Step 0b, an 8 GB box cannot host both at
once. This is the main argument for leaving the categories cron off on prod and
copying that column from dev instead.

---

## Step 3 — Merge and deploy the code

```bash
# ── Backend ───────────────────────────────────────────────
cd <APP_PATH>
sudo -u trl git fetch origin
sudo -u trl git checkout production
sudo -u trl git merge --ff-only origin/dev      # fails loudly if not fast-forward
sudo -u trl git push origin production

sudo -u trl npm ci
```

If `--ff-only` fails, production has commits dev does not. Stop and reconcile
deliberately; do not resolve it with a merge commit under time pressure.

**Do not build yet** — env vars first, because the build output is what
`migration:run` reads.

---

## Step 4 — Environment variables

Append to the production `.env`. Every one of these has a safe default, so a
missed line degrades rather than breaks — but the defaults are not all what you
want on prod.

```bash
# ── Python / AI ──────────────────────────────────────────
PYTHON_BIN=/opt/trl-ai/venv/bin/python
HF_HOME=/opt/trl-ai/hf

# ── Nightly AI top-up: OFF for this deploy ───────────────
# This is the per-day trickle of newly ingested titles, NOT the bulk fill.
# Leave it off until Phase 2 has finished, or it will grind through the same
# 1.35M-row backlog on CPU that we are about to copy in wholesale.
AI_BACKFILL_ENABLED=false

# When you do turn it on, each job gets its own time so the three models never
# load simultaneously. An unset cron means that job is simply not scheduled.
# AI_BACKFILL_CLASS_VECTOR_CRON=0 2 * * *
# AI_BACKFILL_EMBEDDING_CRON=30 3 * * *
# AI_BACKFILL_CATEGORIES_CRON=0 5 * * *     # requires Ollama (Step 2)
# AI_BACKFILL_TIMEZONE=UTC
# AI_BACKFILL_MAX_RUNTIME_MIN=60

# ── Ollama (only used by the categories job) ─────────────
AI_OLLAMA_URL=http://localhost:11434/api/generate
AI_OLLAMA_MODEL=qwen2.5:1.5b

# ── Popularity ───────────────────────────────────────────
# Identifies us to Open Library, which raises the rate limit 1 -> 3 rps.
# Optional: the fetcher falls back to exactly this string.
POPULARITY_USER_AGENT="TRL/1.0 (+admin@therentallibrary.com)"
```

**There is no `GOOGLE_BOOKS_API_KEY`.** Google Books was removed after it
matched 0 of 2,025 titles across 37 consecutive nightly runs. If the line exists
in any `.env`, delete it, and revoke the key rather than leaving a live
credential lying around.

### Cron schedules that are NOT configurable

Two schedules are hardcoded. Know that they exist, because they will fire:

| Cron | When (UTC) | What it does on a fresh prod |
|---|---|---|
| `ai_active_recommendation_tick` | 03:00 daily | Ranks active titles against `AI_Class_Vector`. **Until Phase 2 populates vectors this FAILS every night**, by design: `active_recommendations.py` raises `no active books with AI_Class_Vector found.` and exits 1, so a `failed` row lands in `ai_recommendation_runs` once a day. See "Expected noise during Phase 1" below. |
| `popularity_tick` | 04:00 daily | Scores active titles from Open Library. Works immediately — no AI dependency. |

### Expected noise during Phase 1

The AI features return nothing while the columns are empty. Only one of them
is noisy about it, and knowing which log lines are expected is the difference
between a calm deploy and an hour of chasing nothing:

| Where | What you will see | Why |
|---|---|---|
| Backend boot | `no embeddings in audios.ai_embedding — serving an empty index (dim 768)`, then `recommender ready (indexed=0)` | The child stays alive on an empty index so the reindex button works later. It used to exit here, which stranded the feature until a restart. |
| `POST /admin/ai-recommendations` | `200` with an empty result list | The index is empty; there is nothing to match. Not an error. |
| 03:00 UTC daily | A `failed` row in `ai_recommendation_runs`, message `no active books with AI_Class_Vector found.` | `active_recommendations.py` raises rather than writing an empty ranking. |

One consequence worth deciding about up front:

**The nightly failure is the exact pattern we just removed from popularity.**
Google Books failed silently for 37 consecutive nights; the AI pipeline failed
24 nights in a row and went unnoticed for six weeks. A daily `failed` row that
is *expected* for the duration of Phase 1 trains everyone to ignore the one
place that reports real failures. If Phase 1 will sit in production for more
than a few days, make the scheduler skip the tick when the vector count is zero
and log why — self-correcting, with no env flag anyone has to remember to flip
once the data lands.

---

## Step 5 — Build, then migrate

**Order matters.** `src/database/data_source.ts` globs
`dist/database/migrations/*.js`, not `src/`. Running `migration:run` before a
build reports `No migrations are pending` against a database that is four
migrations behind — a silent no-op that looks like success.

```bash
cd <APP_PATH>
sudo -u trl npm run build
sudo -u trl npm run migration:show      # expect 4 marked [ ]
sudo -u trl npm run migration:run
```

Expected final lines:

```
Migration AddAiColumnsToAudios1785000000000 has been executed successfully.
Migration CreateAiActiveRecommendations1786000000000 has been executed successfully.
Migration CreateAudioPopularity1787000000000 has been executed successfully.
Migration PopularityNullableScoreAndSourceCounts1788000000000 has been executed successfully.
```

Nothing is running yet, so this happens with the old build still serving
traffic — the API stays up throughout. All four migrations are additive: new
columns, new tables, one dropped `NOT NULL`. No column is dropped or retyped,
so the currently-running old code keeps working against the new schema.

If the build fails with `EACCES: permission denied, rmdir .../dist/...`, a
previous build ran as root. Fix the ownership rather than rebuilding as root:

```bash
sudo chown -R trl:trl <APP_PATH>/dist
```

### What 1785 does about the ANN index

1785 creates the HNSW index inline only when the column holds fewer than
100,000 vectors. On prod the column is empty, so it creates an **empty** index
instantly. That is correct here but has a consequence for Phase 2: bulk-loading
1.35M vectors into an indexed column maintains the graph row by row and
dominates the runtime. The Phase 2 script refuses to start a large run while
that index exists and prints the drop/rebuild statements.

### Verify the schema

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
-- expect: vector | 0.8.6

SELECT column_name, udt_name
FROM information_schema.columns
WHERE table_name = 'audios'
  AND column_name IN ('ai_embedding','ai_categories','AI_Class_Vector');
-- expect 3 rows: vector, varchar, vector

SELECT count(*) FILTER (WHERE ai_embedding IS NOT NULL)        AS emb,
       count(*) FILTER (WHERE "AI_Class_Vector" IS NOT NULL)   AS cls,
       count(*) FILTER (WHERE ai_categories IS NOT NULL)       AS cat
FROM audios;
-- expect 0 | 0 | 0   <-- this is the expected Phase 1 result

SELECT key, value FROM app_configs WHERE key LIKE 'popularity_%' ORDER BY key;
-- expect exactly 3 rows:
--   popularity_interval_days             = 1
--   popularity_min_confidence_display    = 1
--   popularity_source_weight_openlibrary = 1.00

SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'audio_popularity_scores' AND column_name = 'popularity_score';
-- expect YES  (1788 ran)
```

---

## Step 6 — Restart the backend

```bash
sudo -u trl pm2 restart trl-backend --update-env
sudo -u trl pm2 logs trl-backend --lines 150
```

`--update-env` is mandatory, or PM2 keeps the previous environment and none of
Step 4 takes effect.

**What a correct startup looks like on empty columns:**

- Routes mounted, including `/admin/popularity*` and the AI recommendation routes
- `spawning python recommender: …/recommender.py`
- The recommender reports **0 vectors indexed**. Correct — the columns are empty.
- `popularity_tick` and `ai_active_recommendation_tick` registered
- `AI backfill cron disabled (AI_BACKFILL_ENABLED is not "true")`
- Possibly `audio_popularity_scores is empty and no successful run recorded` —
  benign, Step 8 fixes it

**What must NOT appear:**

- `ModuleNotFoundError` — `PYTHON_BIN` is wrong or the venv install failed
- `python recommender restart limit reached (5); giving up` — the child cannot
  start. Run it by hand to see the real error:
  ```bash
  sudo -u trl PYTHON_BIN=/opt/trl-ai/venv/bin/python \
    /opt/trl-ai/venv/bin/python <APP_PATH>/dist/ai/scripts/recommender.py
  ```
- `column … does not exist` — Step 5 did not actually migrate (the skipped build)

---

## Step 7 — Elasticsearch: required, not optional

Prod's `es_audios` index has **no mapping** for `ai_categories` or
`popularity_score`. Two consequences:

1. The admin catalogue's AI Category column renders `--` for every row, because
   the list reads `hit._source`.
2. Sorting by popularity **errors**. The sort clause sets `missing: '_last'` but
   not `unmapped_type`, so Elasticsearch rejects a sort on a field it has never
   seen.

The mapping is added by exactly one thing — `ensureIndexExists()`, which runs
only inside `syncAudios()`. It is **not** called at boot. So this must run:

```bash
cd <APP_PATH>
sudo -u trl npm run elastic:sync-audios
```

It reconciles the mapping first (`putMapping` for the new fields), then
re-indexes. Run it in `screen`/`tmux` — it walks ~1.4M documents.

Verify:

```bash
curl -s -u "$ES_USER:$ES_PASS" \
  "https://es.trainingresourcelibrary.com/es_audios/_mapping?filter_path=**.ai_categories,**.popularity_score"
# expect ai_categories: keyword, popularity_score: integer
```

Do not postpone this step to "after the AI data arrives". The popularity sort
breaks without it, and popularity goes live today.

---

## Step 8 — Seed popularity

Independent of all AI work. Open Library only, no key.

```bash
cd <APP_PATH>
sudo -u trl npm run popularity:seed
```

Expected, with ~2,157 active titles on prod:

```
   Status:           success
   Audios processed: ~2157
   Audios matched:   ~1000
```

**Roughly half matching is the correct outcome, not a bug.** Open Library covers
trade and literary titles well and Christian, academic and small-press titles
poorly. Unmatched titles are stored `popularity_score = NULL`, `confidence = 0`
— *unmeasured*, distinct from a measured zero — and the admin UI shows them as
**No data**.

If the status comes back `partial`, the run completed and committed but Open
Library matched **zero** titles, which means a broken fetcher. Exit code is
still 0 so a deploy is not blocked. Diagnose with:

```sql
SELECT status, source_match_counts, audios_processed
FROM audio_popularity_runs ORDER BY started_at DESC LIMIT 1;
```

---

## Step 9 — Deploy the admin portal

```bash
sudo -u trl pm2 list                     # confirm the cwd
cd <PORTAL_PATH>
sudo -u trl git checkout production
sudo -u trl git merge --ff-only origin/development
sudo -u trl git push origin production
sudo -u trl npm ci && sudo -u trl npm run build
sudo -u trl pm2 restart trl-admin-portal --update-env
```

Backend first, portal second. The portal's new pages call endpoints that only
exist in the new backend; the reverse order gives you a window of 404s.

Hard-refresh (Ctrl+Shift+R), then check:

- **AI Recommendation** menu shows *By Prompt*, *Active-Based List*, *Popularity*, *Run History*
- **Popularity** page loads; scored titles sort above **No data** ones
- **Configuration** → Popularity section shows 3 inputs (Interval, Min
  Confidence, Source Weight — Open Library `1.00`). No Google weight input.
- **By Prompt** returns nothing / a 503-style "recommender unavailable". Correct
  for Phase 1 — there are no vectors yet.

---

# Phase 2 — Copying the AI columns from dev

Run only after the AI developer confirms the dev fill is complete. Everything
here is in the `trl-migration` repo.

Dev state at the time of writing, for reference — your actual numbers will be
higher:

| Column | Dev rows filled |
|---|---|
| `AI_Class_Vector` | 1,355,626 |
| `ai_embedding` | 678,531 |
| `ai_categories` | 2,028 |

SKU reconciliation, measured: **1,421,121 SKUs exist in both**; every prod SKU
exists in dev; 1,244 dev SKUs are absent from prod, of which **282 carry AI
data and will be skipped** (logged, not silently dropped).

### 2a. Drop the ANN index first

```sql
DROP INDEX IF EXISTS idx_audios_ai_class_vector_cos;
```

The script refuses to start a run of more than 50,000 rows while it exists, and
prints these statements, so this is a guard rather than a trap.

### 2b. Rehearse, then run

```bash
cd trl-migration
docker compose up -d --build

# nothing is written; reports batch sizes and how many SKUs are missing on prod
docker compose exec migration_app python \
  /app/scripts/14_sync_ai_columns_dev_to_prod.py --dry-run

# small real slice, end to end, including the Elasticsearch patch
docker compose exec migration_app python \
  /app/scripts/14_sync_ai_columns_dev_to_prod.py --limit 2000

# the full run — resumable; re-running after a kill continues from the
# last committed batch
docker compose exec migration_app python \
  /app/scripts/14_sync_ai_columns_dev_to_prod.py
```

Progress lives in `scripts/migration_14_tracking.json` (written atomically, so
a kill mid-write cannot corrupt it). Logs land in `logs/sync_ai_columns_*.log`.

How it behaves, and why:

- **Keyset pagination on `sku`**, not `OFFSET` — `OFFSET` re-scans everything it
  skips, so late batches would re-read a million rows to produce 500.
- **Text `COPY` through an `UNLOGGED` staging table on prod**, then one
  `UPDATE … FROM`. Text rather than binary because this crosses PG 16 → PG 18
  and pgvector 0.8.1 → 0.8.6, and binary send/recv formats are tied to versions.
- **`COALESCE(new, existing)`** per column, so a NULL on dev never erases a
  value on prod. Safe to re-run as more rows get filled.
- **`IS DISTINCT FROM` guard**, so a re-run over already-synced SKUs writes
  nothing — no dead tuples, no pointless `updated_at` bump, no Elasticsearch
  churn.
- **`updated_at` is bumped** on every touched row. This is load-bearing:
  FAISS ingests new vectors by polling for rows past its watermark, so a sync
  that leaves the timestamp alone is invisible to it and the index stays empty.
- **Ordering is computed on dev only**; prod is matched by explicit SKU through
  the staging table, so the PG 16 / PG 18 collation difference cannot
  desynchronise the two sides.
- **A Postgres advisory lock** prevents two operators running it at once.
- **Elasticsearch** gets a partial `update` of `ai_categories` only — the
  vectors are not in the mapping at all. `doc_as_upsert` is off on purpose: a
  missing prod document is reported, not replaced by a stub containing one
  field. If any are reported missing, fix them with `elastic:sync-audios`.

### 2c. Rebuild the ANN index

```sql
SET maintenance_work_mem = '2GB';   -- verified settable on this role
CREATE INDEX CONCURRENTLY idx_audios_ai_class_vector_cos
  ON audios USING hnsw ("AI_Class_Vector" vector_cosine_ops);
```

`CONCURRENTLY` keeps the table writable; it cannot run inside a transaction, so
issue it on its own. Expect this to take a while — dev's equivalent index is
4,824 MB.

The default 266 MB `maintenance_work_mem` forces a slower disk-based build, so
the `SET` is worth it. It applies to the session only.

### 2d. Reindex from the admin panel

`recommender.py` now comes up **ready with an empty index** when the columns
hold no vectors, instead of reporting a startup failure and exiting. That is
what makes this step work: the Python child is alive and waiting, so the admin
panel's reindex button has something to talk to.

Press **reindex** in the admin panel. It sends `refresh`, and `ingest_delta`
runs with a null watermark, which streams *every* row — so the first refresh
after a bulk load does the work of a full build.

**Expect the first click to report a timeout. The work does not stop.**

`POST /admin/ai-recommendations/refresh` awaits the Python reply inside the
HTTP request, with a 10-minute ceiling — and any reverse proxy in front will
give up well before that. Ingesting ~1.35M vectors into an HNSW graph takes far
longer. What actually happens:

1. You click. The browser eventually shows a failed request.
2. Python keeps ingesting, unaffected. The timeout only discards the pending
   reply on the Node side; the child is never killed.
3. It finishes, extends its SKU list, and persists the index.
4. Click reindex again. It returns immediately with `added: 0` and the true
   indexed count, because the watermark has advanced.

**Do not restart the backend while step 2 is in progress.** The index is only
persisted *after* the ingest completes, so a restart throws away everything
ingested so far and starts over. Someone who reads the first timeout as a
failure and restarts can loop on this indefinitely.

Watch the actual progress instead — `ingest_delta` logs every 5,000 rows:

```bash
sudo -u trl pm2 logs trl-backend --lines 500 | grep -iE "streamed|ingested|indexed|faiss"
```

A backend restart is a valid alternative to the button: on boot with populated
columns the recommender runs a full build, which logs progress the same way and
has no HTTP timeout attached. Same end state. The button is better for top-ups
afterwards, where the delta is small and returns in seconds.

### Verify

```bash
sudo -u trl pm2 logs trl-backend --lines 200 | grep -iE "recommender ready|indexed"
```

Expect `recommender ready (indexed=N)` on the next boot, with N matching:

```sql
SELECT count(*) FROM audios a
JOIN audio_metadata m ON m.sku = a.sku
WHERE a.ai_embedding IS NOT NULL AND a.deleted_at IS NULL
  AND a.is_excluded = false AND m.language ILIKE '%english%';
```

The filters matter — the index deliberately excludes non-English titles (the
BGE model is English-only) and `is_excluded` ones, so the index count is
expected to be lower than the raw non-null count.

Then test a prompt from **AI Recommendation → By Prompt** and confirm results
come back.

### 2e. Turn on the nightly top-up

Only now, with the bulk fill done, is the trickle job worth running:

```
AI_BACKFILL_ENABLED=true
AI_BACKFILL_CLASS_VECTOR_CRON=0 2 * * *
AI_BACKFILL_EMBEDDING_CRON=30 3 * * *
```

Leave `AI_BACKFILL_CATEGORIES_CRON` unset unless Ollama is installed and the box
has RAM to spare for it (Step 2's memory note). Restart with `--update-env`.

---

## Rollback

Code rolls back cleanly. Data needs more care.

```bash
cd <APP_PATH>
sudo -u trl git checkout <previous-production-sha>
sudo -u trl npm ci && sudo -u trl npm run build
sudo -u trl pm2 restart trl-backend --update-env

cd <PORTAL_PATH>
sudo -u trl git checkout <previous-production-sha>
sudo -u trl npm ci && sudo -u trl npm run build
sudo -u trl pm2 restart trl-admin-portal --update-env
```

**You usually do not need to roll back the migrations.** All four are additive;
the previous code ignores the new columns and tables entirely.

If you do:

- `npm run migration:rollback` reverts **one** migration per invocation, newest
  first.
- 1788's `down()` must set `popularity_score = 0` to restore `NOT NULL`, which
  re-creates the exact unmeasured/unpopular conflation that migration removed.
  The distinction survives in `confidence = 0`, so re-running `up()` restores
  it — but avoid the round trip unless the schema change is itself the problem.
- 1785's `down()` is a deliberate no-op. It will **not** drop the AI columns,
  because dropping a column holding 6 GB of hard-won vectors on the strength of
  a rollback command is not a decision a migration should make for you. Drop
  them by hand if you genuinely mean to.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `No migrations are pending` but the schema is old | `npm run build` was skipped. `data_source.ts` reads `dist/`, not `src/` |
| `EACCES … rmdir dist/...` on build | A previous build ran as root. `sudo chown -R trl:trl <APP_PATH>/dist` |
| `ModuleNotFoundError` in recommender logs | `PYTHON_BIN` not pointing at `/opt/trl-ai/venv/bin/python`, or the pip install failed |
| `restart limit reached (5); giving up` | Run `recommender.py` by hand (Step 6) to see the real error |
| Recommender reports 0 indexed | Expected in Phase 1. After Phase 2, check `updated_at` was bumped and that the reindex was triggered |
| Model downloads on every restart | `HF_HOME` unset in the backend env, so the cache lands in a different home each time |
| AI Category column shows `--` for every row | `ai_categories` missing from the ES mapping — run `elastic:sync-audios` (Step 7) |
| Sorting by popularity 500s | Same cause: the field is unmapped and the sort has no `unmapped_type` |
| Popularity page: page 1 all **No data** | `NULLS LAST` lost from the list ordering. Postgres sorts NULL first on `DESC` |
| About half of titles are **No data** | Expected. Confirm the proportion is stable run to run rather than growing |
| Popularity run status `partial` | A source matched 0 titles catalogue-wide. `SELECT source_match_counts FROM audio_popularity_runs ORDER BY started_at DESC LIMIT 1` names it |
| OOM kill on the app server | Step 0b. Check for a second backend process: `pm2 list` plus `ps aux \| grep "node dist/main"` |
| Every cron fires twice | A duplicate backend instance — this happened on dev with a root-owned process |
| Phase 2 run is very slow | The HNSW index was not dropped (Step 2a) |
| Phase 2: "another instance holds the advisory lock" | A previous run is still live, or died without releasing. Confirm with `pg_locks` before overriding |

---

## Appendix — new environment variables

| Var | Default | Needed on prod? |
|---|---|---|
| `PYTHON_BIN` | `python3` | **Yes** — point at the venv |
| `HF_HOME` | OS default | **Yes** — or the model re-downloads |
| `AI_BACKFILL_ENABLED` | `false` | Keep `false` until Phase 2 is done |
| `AI_BACKFILL_CLASS_VECTOR_CRON` | unset = not scheduled | Phase 2e |
| `AI_BACKFILL_EMBEDDING_CRON` | unset = not scheduled | Phase 2e |
| `AI_BACKFILL_CATEGORIES_CRON` | unset = not scheduled | Only with Ollama + RAM |
| `AI_BACKFILL_TIMEZONE` | `UTC` | Optional |
| `AI_BACKFILL_MAX_RUNTIME_MIN` | `60` | Optional |
| `AI_OLLAMA_URL` | `http://localhost:11434/api/generate` | Only for categories |
| `AI_OLLAMA_MODEL` | `qwen2.5:1.5b` | Only for categories |
| `POPULARITY_USER_AGENT` | the same string, in code | Optional |
| `GOOGLE_BOOKS_API_KEY` | — | **Delete it.** Read by nothing |
