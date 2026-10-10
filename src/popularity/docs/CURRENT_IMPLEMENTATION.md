# Popularity — Current Implementation

Everything about **what's in the repo right now**: which sources feed the score, exactly how the score is computed, where each piece of code lives, and how to change any of it without breaking the pipeline.

For sources we could add in the future (with pricing / signup URLs), see [`AVAILABLE_SOURCES.md`](./AVAILABLE_SOURCES.md).

---

## Sources actually used

One, free, no key required:

| # | Source | Auth | Weight (default) | Signal |
|---|---|---|---|---|
| 1 | **Open Library** | none (`User-Agent` recommended) | `1.00` | `readinglog_count` — cumulative users who logged the book |

Per-title, **ISBN-first** with a title+author fallback when the ISBN lookup returns zero results.

> ### Google Books was removed
>
> It shipped as a second source at weight `0.40` and **matched 0 of 2,025
> titles across 37 nightly runs**. Measured against the live API:
>
> - the field-scoped operators it relied on — `isbn:`, `intitle:`, `inauthor:`
>   — all return `totalItems: 0` from the public v1 API. A valid key and an
>   unlimited quota would not have changed this.
> - free-text `title author` does return, but only ~36% of results carry a
>   rating, and **a third of those are the wrong book** — one title resolved
>   to *Catalog of Copyright Entries*.
> - the ratings that do exist have counts in the single digits. Open Library
>   returns reading-log counts in the tens of thousands.
>
> A second external dependency — with its own quota, circuit breaker and
> match-verification gate — was not worth ratings from four people. Sections
> below that still describe two sources are historical.

### Why these two

They're the only two authenticated public APIs that:
1. Are truly free forever ($0 cost)
2. Answer "given this title, what's its popularity?" (per-title, not just charts)
3. Cover ≥ 70 % of a mixed audiobook catalogue after ISBN + title fallback
4. Return machine-readable JSON with stable schemas
5. Impose no NDA / attribution burden that conflicts with our admin-panel use case

Anything else with better signal quality either requires paid access (Bookscan, Spotify extended quota) or is deprecated (Goodreads, Amazon PA-API v5). See [`AVAILABLE_SOURCES.md`](./AVAILABLE_SOURCES.md) for the full evaluation.

---

## Score formula

For each active audio, on each run:

```
For each source (open_library, google_books):
  sub_score[source] = fetcher.fetch(audio)    // 0-100 or null

  If sub_score is null → source is a "miss" (excluded from denominator)

popularity_score = round(
    Σ (sub_score[source] × weight[source])   over matched sources
    ─────────────────────────────────────
       Σ weight[source]                        over matched sources
)

confidence = count of sources that matched   // 0, 1, or 2
```

Missing sources are **excluded from both numerator and denominator** — a book that only matched on Open Library still gets its OL sub-score as the final popularity (not divided by the total weight of both sources), so the score always reflects the quality of *matched* signal, never dragged down by a missing one.

### Sub-score formulae per source

**Open Library** — `readinglog_count` → sub-score 0–100:

```
sub_score = min(100, round(min(1, log10(1 + readinglog_count) / 5) × 100))
```

Log-normalised over 5 orders of magnitude:

| readinglog_count | sub-score |
|---:|---:|
| 10 | 20 |
| 100 | 40 |
| 1,000 | 60 |
| 10,000 | 80 |
| 100,000+ | 100 |

Rationale: Open Library reads span from 0 to ~50,000 for mega-hits. Log curve compresses the long tail so a book with 500 reads (fairly known) vs 5,000 reads (very known) differs by ~15 points, not 100x.

**Google Books** — `averageRating (1–5)` + `ratingsCount` → sub-score 0–100:

```
volume_multiplier = min(1, log10(1 + ratingsCount) / 4)
sub_score = round(averageRating × 20 × volume_multiplier)
```

Volume multiplier caps at 1.0 when `ratingsCount ≥ 10,000`.

| rating | ratings_count | sub-score |
|---:|---:|---:|
| 4.5 | 3 | 14 |
| 4.5 | 100 | 45 |
| 4.5 | 1,000 | 68 |
| 4.5 | 10,000 | 90 |
| 4.3 | 3,000 | 74 |
| 4.9 | 3 | 15 |

Rationale: prevents a 4.9-star book with 3 total ratings from beating a 4.3-star book with 3,000 ratings. Rating quality only matters when there's enough sample size to trust it.

### Worked example

Audio: **"Sapiens: A Brief History of Humankind"** (ISBN 9780062316097)

- Open Library returns `readinglog_count = 5904`.
  - `log10(1 + 5904) / 5 = 3.771 / 5 = 0.754`
  - `sub_score = round(0.754 × 100) = 75`
- Google Books returns `averageRating = 4.5`, `ratingsCount = 1287`.
  - `volume_multiplier = min(1, log10(1288) / 4) = log10(1288)/4 = 3.110/4 = 0.777`
  - `sub_score = round(4.5 × 20 × 0.777) = round(69.97) = 70`

Both sources matched → composite:
- Numerator: `75 × 0.60 + 70 × 0.40 = 45 + 28 = 73`
- Denominator: `0.60 + 0.40 = 1.00`
- `popularity_score = 73`
- `confidence = 2`

If Open Library had missed (title fallback also returned 0 docs):
- Numerator: `70 × 0.40 = 28`
- Denominator: `0.40`
- `popularity_score = 70` (unchanged — the score reflects Google's data alone)
- `confidence = 1`

---

## Data flow

```
┌───────────────────────┐
│ Cron @ 04:00 UTC      │───── or manual "Refresh Now"  ────┐
│ (interval-gated)      │                                    │
└───────────────────────┘                                    │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │ PopularityRunnerService.start│
                                              │  ‣ single-flight mutex       │
                                              │  ‣ create pending run row    │
                                              │  ‣ 3h hard timeout           │
                                              └──────────────────────────────┘
                                                             │
                                                             ▼
                                              ┌──────────────────────────────┐
                                              │  load active audios (~2500)  │
                                              └──────────────────────────────┘
                                                             │
                                     ┌────── per batch of 8 audios ──────┐
                                                  ▼
                                     ┌────────────────────────┐
                                     │  OpenLibraryFetcher    │
                                     │  ‣ token-bucket 3rps   │
                                     │  ‣ 24h Redis cache     │
                                     │  ‣ ISBN → title fall.  │
                                     │  ‣ withRetry (3×,BOff) │
                                     │  ‣ 429 → cooldown 30s  │
                                     │  ‣ circuit breaker     │
                                     └───────────┬────────────┘
                                                  ▼
                                    ┌──────────────────────────────┐
                                    │  PopularityComposerService   │
                                    │  weighted avg of matched src │
                                    └──────────────────────────────┘
                                                  │
                                                  ▼
                          ┌───────────────────────────────────────────────┐
                          │  Transaction:                                  │
                          │   • UPSERT audio_popularity_scores (on sku)   │
                          │   • INSERT audio_popularity_history           │
                          │  → mark run success                            │
                          │  → invalidate Redis read cache                │
                          └───────────────────────────────────────────────┘
                                                  │
                                                  ▼
                          ┌───────────────────────────────────────────────┐
                          │  Admin UI reads from                          │
                          │   GET /admin/popularity           (Redis 60s) │
                          │   GET /admin/popularity/status    (Redis 15s) │
                          │   GET /admin/popularity/export    (streamed)  │
                          └───────────────────────────────────────────────┘
```

---

## Where each thing lives in the code

| Concern | File |
|---|---|
| Storage — current scores | [`entities/audio-popularity-score.entity.ts`](../entities/audio-popularity-score.entity.ts) |
| Storage — history (append-only) | [`entities/audio-popularity-history.entity.ts`](../entities/audio-popularity-history.entity.ts) |
| Storage — run tracker | [`entities/audio-popularity-run.entity.ts`](../entities/audio-popularity-run.entity.ts) |
| Migration + app_config seeds | [`../../database/migrations/1787000000000-create_audio_popularity.ts`](../../database/migrations/1787000000000-create_audio_popularity.ts) |
| Fetcher interface | [`services/fetchers/popularity-fetcher.interface.ts`](../services/fetchers/popularity-fetcher.interface.ts) |
| Fetcher base class (cache + circuit breaker) | [`services/fetchers/base-fetcher.ts`](../services/fetchers/base-fetcher.ts) |
| Open Library fetcher | [`services/fetchers/open-library.fetcher.ts`](../services/fetchers/open-library.fetcher.ts) |
| Token-bucket rate limiter + cooldown | [`services/fetchers/rate-limiter.ts`](../services/fetchers/rate-limiter.ts) |
| Retry with backoff + Retry-After | [`services/fetchers/retry.helper.ts`](../services/fetchers/retry.helper.ts) |
| Weighted-average composer | [`services/popularity-composer.service.ts`](../services/popularity-composer.service.ts) |
| Runner (orchestration, mutex, upsert, cache invalidation) | [`services/popularity-runner.service.ts`](../services/popularity-runner.service.ts) |
| Read API (list, status, CSV export, cache) | [`services/popularity.service.ts`](../services/popularity.service.ts) |
| Cron scheduler (interval-gated) | [`schedulers/popularity.scheduler.ts`](../schedulers/popularity.scheduler.ts) |
| First-run CLI seed script | [`scripts/seed-popularity.ts`](../scripts/seed-popularity.ts) |
| Nest module wiring | [`popularity.module.ts`](../popularity.module.ts) |
| Admin HTTP endpoints | [`../../admin/controllers/admin-popularity.controller.ts`](../../admin/controllers/admin-popularity.controller.ts) |
| App-config DTO extensions (5 new keys) | [`../../app-config/dto/update-app-config.dto.ts`](../../app-config/dto/update-app-config.dto.ts) |
| App-config seeder | [`../../database/seeders/app_config.seeder.ts`](../../database/seeders/app_config.seeder.ts) |
| Env vars | [`../../../.env.example`](../../../.env.example) — `GOOGLE_BOOKS_API_KEY`, `POPULARITY_USER_AGENT` |

Frontend (admin-portal, separate repo):
| Concern | File |
|---|---|
| Popularity page | `admin-portal/src/app/(auth)/(dashboard)/ai-recommendations/popularity/page.tsx` |
| Table columns | `admin-portal/src/components/features/ai-recommendation/popularity-columns.tsx` |
| Service client | `admin-portal/src/services/modules/popularity.service.ts` |
| Types | `admin-portal/src/types/popularity.types.ts` |
| Configuration section | `admin-portal/src/app/(auth)/(dashboard)/configuration/page.tsx` (Popularity block) |
| Sidebar entry | `admin-portal/src/components/app-sidebar.tsx` |

---

## Configuration knobs

All admin-tunable via `Admin panel → Configuration → Popularity`. Stored as rows in the existing `app_configs` key/value table.

| Key | Type | Default | What it does |
|---|---|---|---|
| `popularity_interval_days` | int | `1` | Cron gate: pipeline runs at most every N days |
| `popularity_source_weight_openlibrary` | float 0–1 | `1.00` | Weight of Open Library sub-score in composite |
| `popularity_min_confidence_display` | int 0–1 | `1` | Default filter on the Popularity page — audios with fewer matched sources are hidden by default (user can override in UI) |

Weights don't need to sum to 1 — the composer normalizes by the sum of matched-source weights. Changing a weight to `0` effectively disables that source.

**Env vars** (server-side, `.env`):

| Var | Required? | What it does |
|---|---|---|
| `POPULARITY_USER_AGENT` | Optional | Identifies our app to Open Library (raises rate limit 1→3 rps). Default: `TRL/1.0 (+admin@therentallibrary.com)` |

---

## Resilience — how failures are handled

Every failure mode is designed to keep the pipeline running:

| Failure | What happens |
|---|---|
| API returns 429 | `withRetry` waits per `Retry-After` header (or 500 ms → 1.5 s → 4 s + jitter), retries up to 3× total |
| Two 429s within 60 s | Rate limiter opens a 30-second cooldown for that source; new requests block until it lifts |
| 502 / 503 / 504 / network error | Same 3-attempt retry with backoff |
| 4xx (not 429) | Non-retryable — surface to caller immediately (usually means bad query, not a transient issue) |
| 5 consecutive terminal failures on one source | Circuit breaker opens for that source → runner skips it for rest of batch → other source still contributes → audios still get scores (with `confidence: 1`) |
| Runner hangs | 3-hour hard timeout → mutex released → next run can start |
| Pod restart mid-run | `OnModuleDestroy` releases mutex; the in-flight `ai_popularity_runs` row stays as `running` (harmless — scheduler gates on `success`, not "no `running` row") |
| Migration not applied | `PopularityService.onModuleInit` warns but doesn't crash — backend starts normally |
| Redis down | Cache reads fail → fall through to DB directly (degraded but working) |

---

## Runtime characteristics

| Scenario | Duration |
|---|---|
| Cold cache, no Google Books key | ~15 min (throttled by Google's ~1k/day unauth quota) |
| Cold cache, with `GOOGLE_BOOKS_API_KEY` | 5–10 min |
| Warm cache (24h since last run) | ~30 s (Redis serves 100% of external calls) |
| Second run same day (both cached) | ~15 s (only DB writes) |
| Only new audios since last run | Proportional to how many audios changed |

Redis cache TTL for external API responses: **24 hours** per (source, isbn|query, YYYY-MM-DD).

---

## Read-path scale (millions-of-users grade)

- `GET /admin/popularity` — response cached in Redis for **60 s**, keyed by SHA1 of query params. Every cache key tracked in a Redis set (`popularity:list:_keys`) for O(1) invalidation.
- `GET /admin/popularity/status` — cached for **15 s**. Bypassed when the runner is actively running so UI polls see status flip promptly.
- Cache invalidation fires on:
  - Successful run completion (runner service)
  - Manual "Refresh Now" click (drops status cache immediately)
- No `KEYS pop:*` scan anywhere — invalidation uses the tracked-keys set for O(k) work.

Under 10,000 concurrent polling admins (5 s poll interval each = 2,000 rps to status endpoint):
- Cache hit rate: ~99.5 %
- DB queries per second: ~10 (bounded by the 15-second TTL)
- No stampede risk

---

## Testing / operations

### First-run seed (after migration)

```bash
sudo -u trl npm run popularity:seed
```

Blocks until the initial batch is written; prints heartbeat every 30 s; exits 0/1 based on outcome. See [`scripts/seed-popularity.ts`](../scripts/seed-popularity.ts).

### Manual re-run (any time)

Either:
- Admin panel → AI Recommendation → Popularity → **Refresh Now**
- Or: `POST /admin/popularity/regenerate` (returns 202 with `batch_id`)

### Change the schedule

```
Admin panel → Configuration → Popularity → Auto-Refresh Interval (Days)
```

Takes effect at the next cron tick (04:00 UTC daily) — no restart needed.

### Re-tune source weights (without deploy)

```
Admin panel → Configuration → Popularity → Source Weight — Open Library
```

Weights are re-read at the start of every run. New scores written after the change are tagged with a new `source_weights_version` so history rows show which weight set produced them.

### Verify a specific audio's score

```
GET /admin/popularity/{sku}
```

Returns the per-source breakdown including `raw` evidence (which query matched, what the source returned) — useful for debugging why a specific audio has an unexpected score.

### Rollback

The migration's `down()` drops `audio_popularity_scores`, `audio_popularity_history`, `audio_popularity_runs`. The 5 `app_configs` rows are **preserved** (admin may have tuned them; losing on rollback would be a nasty surprise).

---

## What this design is NOT

Honest about the limits:

- **Not a "trending today" signal.** Both current sources measure cumulative all-time engagement. A 1995 title with 500 log entries outranks a 2024 hit with 50. See [`AVAILABLE_SOURCES.md`](./AVAILABLE_SOURCES.md) for the P0 "add time-decay weighting" recommendation to fix this without a new source.
- **Not audiobook-specific.** Open Library surfaces primarily print-edition data. Audio-only ISBNs frequently miss (recovered by title fallback).
- **Not comprehensive.** The best audiobook popularity signals (Audible rank, Bookscan sales, Findaway sales) require paid/partner access we didn't include. See the "Business questions" section of [`AVAILABLE_SOURCES.md`](./AVAILABLE_SOURCES.md).

The MVP is a **B/C signal with A+ engineering** — reliable, scalable, honest about what it measures. Follow-up work to lift it toward "A" signal quality is scoped in [`AVAILABLE_SOURCES.md`](./AVAILABLE_SOURCES.md).
