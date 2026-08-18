# Popularity Data Sources — Full Catalog

Everything we evaluated (or could evaluate) as a source for audiobook popularity ranking. Use this to plan future additions to the popularity pipeline.

**Library scale reference:**
- Active audios: **~2,500** (daily scoring at MVP)
- Total catalog: **~1.35 million** (future full-catalog scoring)

**Research method — how to trust this document:**
Every source below has two link types:
- 📄 **Docs** — where the source's public API is documented
- 💳 **Pricing / signup** — where to verify the cost + get access

Live-verification status is called out per source (either "✅ verified live in this project" or "⚠️ based on published docs, not live-tested from our environment"). Pricing on external APIs changes — **always click the pricing link before making a spend decision.**

---

## Quick-reference matrix

| Source | Auth | Base cost | Live-verified? | Suitable @ 2,500/day | Suitable @ 1.35M/month |
|---|---|---|---|---|---|
| **Open Library** ✅ *(in use)* | none (User-Agent) | $0 | ✅ | ✅ | ✅ (spread over 30 days) |
| **Google Books** ✅ *(in use)* | free API key | $0 | ✅ | ✅ | ✅ (with key + quota upgrade) |
| **Apple iTunes RSS chart** | none | $0 | ✅ | ⚠️ tiny coverage | ❌ |
| **Spotify Web API** | OAuth client-creds | $0 | ✅ (docs) | ✅ | ⚠️ (rate-limit unknown) |
| **NYT Books API** | free API key | $0 | ⚠️ (blocked from our sandbox) | ✅ trivial | ❌ (500/day quota) |
| **Wikipedia Pageviews** | User-Agent | $0 | ⚠️ | ✅ | ✅ |
| **YouTube Data API** | free API key | $0 free tier | ⚠️ | ⚠️ (quota-unit expensive) | ❌ |
| **Reddit API** | OAuth | $0 free tier / **paid $$ above threshold** | ⚠️ | ⚠️ | ❌ |
| **Amazon Product Advertising API v5** | Associates account | — | ✅ **DEPRECATED** | ❌ | ❌ |
| **Amazon Creators API** *(PA-API replacement)* | Associates + 10 sales/30 days | $0 | ✅ (docs) | ✅ | ⚠️ (rate limits unclear) |
| **Google Trends** *(unofficial)* | none | $0 | ⚠️ fragile | ❌ prod-unsafe | ❌ |
| **LibraryThing** | free membership | $0 | ⚠️ | ⚠️ (~50 req/day quota) | ❌ |
| **Goodreads** | — | — | ✅ **DEPRECATED 2020** | ❌ | ❌ |
| **Bookscan / NPD Circana** | enterprise contract | **paid, ~$10k+/yr** | ❌ no public trial | included | included |
| **Publishers Marketplace** | subscription | ~**$25/mo ($300/yr)** | ❌ paywalled | not a per-title API | not a per-title API |
| **Findaway / distributor API** | your existing contract | included | (unknown — ask them) | ✅ if available | ✅ if available |

---

## Per-source detail (with clickable references)

### 1. Open Library ✅ *(currently in use — weight 0.60)*

- 📄 Docs: https://openlibrary.org/dev/docs/api/search
- 💳 Pricing: **Free. No key. Forever.** — https://openlibrary.org/developers/api
- Rate limits: **1 req/sec anonymous; 3 req/sec with `User-Agent` identifying caller.** Bulk backend usage explicitly disallowed — for that, use the monthly data dumps: https://openlibrary.org/developers/dumps
- Live-verified: ✅ Verified in this project's test session — endpoint `https://openlibrary.org/search.json?q=isbn:{ISBN}&fields=readinglog_count,...` returned real data for multiple test ISBNs.

**Signal used:** `readinglog_count` — cumulative distinct users who logged the book.
**Coverage @ 2,500/day:** 70–85 % combined (ISBN + title fallback).
**Coverage @ 1.35M/month:** feasible spread across 30 days (~45k/day, well under 3 rps × 86,400 sec = 259k/day cap).

**Freshness:** all-time cumulative, no recency bias.
**Weakness:** niche indie-reader audience, small numbers.

---

### 2. Google Books API ✅ *(currently in use — weight 0.40)*

- 📄 Docs: https://developers.google.com/books/docs/v1/using
- 💳 Pricing & quota: https://developers.google.com/books  →  https://console.cloud.google.com/apis/api/books.googleapis.com/quotas
- 💳 Terms of Service: https://developers.google.com/books/terms — **explicitly forbids charging end-users for use of an app that uses this API without separate Google permission.**
- Key signup: https://console.cloud.google.com/apis/library/books.googleapis.com
- Rate limits: default **~1,000 req/day per Cloud project** (raiseable to 100k+/day via Cloud Console quota-increase request — no charge, self-service).
- Live-verified: ✅ Verified in this project's session — endpoint `https://www.googleapis.com/books/v1/volumes?q=isbn:{ISBN}` returns real data when quota available; returns 429 with clear `reason: "rateLimitExceeded"` message when exhausted (our retry helper handles this).

**Signal used:** `averageRating × 20 × min(1, log10(1+ratingsCount)/4)`.
**Coverage @ 2,500/day:** ~85 %+ with ISBN, title fallback covers rest.
**Coverage @ 1.35M/month:** ✅ with key + upgraded quota (100k/day × 30 = 3M capacity).

**Freshness:** cumulative ratings; Google shut down direct reviews years ago, so `ratingsCount` is often 0 or single-digit on niche books.
**Weakness:** print-edition data, not audiobook-specific.

---

### 3. Apple iTunes RSS — Top Audiobooks Chart

- 📄 Docs: (undocumented public marketing feed; URL pattern is stable)
- 💳 Pricing: **Free. No key. No signup.**
- Endpoint: `https://itunes.apple.com/us/rss/topaudiobooks/limit=100/json`
- Live-verified: ✅ Verified — endpoint returns `feed.entry[]` ordered by rank (index 0 = rank 1). Uses classic `im:name.label` / `im:artist.label` field encoding.
- Note: Apple's newer `rss.marketingtools.apple.com/api/v2/us/audio-books/...` endpoint **returns 404** for audiobooks (verified). The classic iTunes RSS is the only working audiobook chart URL as of 2026.

**Signal:** chart rank (1 → 100).
**Coverage @ 2,500/day:** ❌ **~0.5–3 %** overlap with a business/learning library. Chart is dominated by current consumer fiction / celebrity memoirs.
**Best use:** as a **boost signal** — heavy weight when a match hits (real "trending today"), ignored otherwise. **Not appropriate as a primary source for niche libraries.**

**Why we removed it from MVP:** near-zero coverage for the target library.

---

### 4. Spotify Web API — Audiobooks

- 📄 Docs: https://developer.spotify.com/documentation/web-api
- 💳 Pricing: **Free.** Dashboard: https://developer.spotify.com/dashboard
- App signup / OAuth registration: https://developer.spotify.com/documentation/web-api/tutorials/getting-started
- Rate limits: **not publicly published**, calculated over a rolling 30-second window. Verified from Spotify docs: https://developer.spotify.com/documentation/web-api/concepts/rate-limits
- Live-verified: ✅ Docs verified in this session.

**Modes** (verified from https://developer.spotify.com/documentation/web-api/concepts/quota-modes):
- **Development mode** (default): Up to 5 authenticated Spotify users allowed for user-authorization flows. Owner must have a Spotify Premium account.
- **Extended quota mode**: As of **May 15, 2025**, requires:
  - Legal business entity
  - Active launched service
  - Minimum **250,000 monthly active users**
  - Presence in key Spotify markets
  - Application via company email + 6-week approval process

**⚠️ CRITICAL for TRL:** For pure server-to-server calls (client-credentials flow, no user auth), the 5-user development-mode limit does not apply because there's no user auth. But rate-limit ceilings still differ between modes — dev mode is lower than extended. TRL would likely qualify for extended quota mode (if it has 250k+ MAU on the audio platform) but should stress-test in dev mode first.

**⚠️ February 2026 changes pending** — Spotify has referenced a "Feb 2026 Dev Mode Changes" migration doc. Verify current terms at https://developer.spotify.com/documentation/web-api/concepts/quota-modes before committing engineering time.

**Signal:** `popularity` field on audiobook objects — integer 0–100 computed by Spotify from total plays × recency. **THIS IS THE BEST FREE "TRENDING TODAY" SIGNAL AVAILABLE.**

**Coverage @ 2,500/day:** ~50–70 % — Spotify Audiobooks catalog launched 2022–23, still growing.
**Coverage @ 1.35M/month:** Feasible but rate-limit uncertain until stress-tested.

**Recommendation:** **P1 next-source-to-add.** OAuth setup is app-level (not per-user), matches the ergonomics of our existing API-key wiring.

---

### 5. NYT Books API

- 📄 Docs: https://developer.nytimes.com/docs/books-product/1/overview
- 💳 Pricing: **Free.** Signup: https://developer.nytimes.com/
- Rate limits: **500 req/day, 5 req/sec** (widely documented on NYT's dev portal; not fetchable from our current sandbox).
- Live-verified: ⚠️ Sandbox blocked from fetching NYT dev portal; specs above are from public knowledge & NYT community documentation.

**Signal:** Weekly bestseller lists. ~30 lists total, including **Audio Fiction** and **Audio Nonfiction** lists. Rank 1–15 per list.

**Coverage @ 2,500/day:** ~0.5–3 % of a business/learning library.
**Coverage @ 1.35M/month:** ❌ 500 req/day quota is a hard cap; use the snapshot pattern (1 call/day) — matches only ~450 books/week regardless of library size.

**Best use:** boost signal for bestseller prestige. Not a broad-coverage source.

**Why we removed it from MVP:** requires a key (user constraint was "no keys" for iteration 1) + coverage is small.

---

### 6. Wikipedia Pageviews API

- 📄 Docs (index): https://api.wikimedia.org/wiki/Main_Page
- 📄 Pageviews specifics: https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews
- 💳 Pricing: **Free.** No signup. **User-Agent header REQUIRED** identifying app + contact per Wikimedia's User-Agent policy: https://meta.wikimedia.org/wiki/User-Agent_policy
- Rate limits: ~200 req/sec (community-reported; Wikimedia asks callers to be respectful).
- Live-verified: ⚠️ Sandbox couldn't reach the exact endpoint; docs verified.

**Signal:** daily/monthly pageview counts for a Wikipedia article. Cultural attention proxy.
**Coverage @ 2,500/day:** ~10–20 % (only known-famous titles have articles).
**Weakness:** Title-to-article matching is noisy ("Freedom" collides with many articles).

**Recommendation:** low-effort supplementary signal (P3) — not worth prioritizing.

---

### 7. YouTube Data API v3

- 📄 Docs: https://developers.google.com/youtube/v3
- 💳 Pricing: **Free tier, quota-unit based.** https://developers.google.com/youtube/v3/getting-started#quota
- Key signup: https://console.cloud.google.com/apis/library/youtube.googleapis.com
- **Quota units** (critical): each API operation costs units. `search.list` = **100 units**. `videos.list` = 1 unit. **Default daily quota = 10,000 units** = ~100 searches/day.
- Live-verified: ⚠️ Pricing/quota specs from Google's public docs, not fetched live this session.

**Signal:** `search.list` for `"{title}" audiobook` + `videos.list` for view counts. Cultural presence via video volume + total views.

**Coverage @ 2,500/day:** ❌ **quota is the deal-breaker.** 100 searches/day means 25 days to cycle through 2,500 titles once. Quota upgrade requires justification form: https://support.google.com/youtube/contact/yt_api_form

**Recommendation:** skip unless quota upgrade approved.

---

### 8. Reddit API

- 📄 Docs: https://www.reddit.com/dev/api
- 💳 Data API terms (pricing changes announced 2023): https://www.redditinc.com/policies/data-api-terms
- Historic pricing announcement: https://www.redditinc.com/blog/apifacts *(sandbox couldn't fetch — check in browser)*
- Live-verified: ❌ Sandbox blocked from all reddit.com domains.

**Known publicly (as of 2024–2026):**
- **Free tier**: **100 QPM per OAuth client** for non-commercial use, or commercial use with API access agreement. Sufficient for our 2,500 titles/day.
- **Paid tier**: introduced July 2023 — commercial high-volume access pricing quoted publicly at **~$0.24 per 1,000 API calls**. Only relevant for high-scale commercial data mining.
- All requests require OAuth 2.0 (app registration is free).

**Signal:** mention frequency in `/r/audiobooks`, `/r/books`, `/r/suggestmeabook` etc. over last N days. Real community buzz.

**Coverage @ 2,500/day:** ✅ within free tier.
**Weakness:** high noise — needs relevance scoring on top (title mentions in unrelated threads).

**Recommendation:** P3 — useful only combined with text-relevance filtering.

---

### 9. Amazon Product Advertising API (PA-API v5) — ⚠️ **DEPRECATED**

- 📄 Docs (archive): https://webservices.amazon.com/paapi5/documentation/
- Live-verified: ✅ Amazon returns 302 redirect to the deprecation notice: https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation
- **Status:** PA-API v5 requests return HTTP 403 `AccessDeniedException` and are being decommissioned.
- **Replacement:** Amazon Creators API (below).

---

### 10. Amazon Creators API *(PA-API v5 replacement)*

- 📄 Docs: https://affiliate-program.amazon.com/creatorsapi/docs
- 💳 Pricing: **$0 per call.** But **requires an active Amazon Associates account with ≥10 qualifying sales in the past 30 days** (Amazon Associates enrollment: https://affiliate-program.amazon.com/).
- Operations: `SearchItems`, `GetItems`, `GetVariations`, `GetBrowseNodes`.
- Live-verified: ✅ Docs verified in this session; **SalesRank field availability is NOT explicitly documented in the migration guide — a quick test call from an active Associate account is required to confirm parity with PA-API v5**.

**Signal (if SalesRank IS returned):** Amazon audiobook category sales rank — **industry gold standard.**

**Coverage @ 2,500/day:** ✅ well within any reasonable per-second rate.
**Coverage @ 1.35M/month:** rate limits TBD — needs testing.

**Recommendation:** **P1 IF TRL has an active Amazon Associates account meeting the 10-sales/30-days threshold.** Otherwise, unavailable.

---

### 11. Google Trends (via `pytrends` or similar)

- 📄 Library: https://github.com/GeneralMills/pytrends
- 💳 Pricing: **Free.** No signup.
- Live-verified: ⚠️ Well-known to break frequently when Google updates the trends.google.com frontend.

**Signal:** search-interest score 0–100 in a chosen time window.
**Weakness:** unofficial. Broken multiple times per year. **NOT suitable for a production pipeline ops depend on.**

**Recommendation:** ❌ skip for MVP and beyond.

---

### 12. LibraryThing

- 📄 Docs: https://www.librarything.com/services/
- 💳 Pricing: **Free membership; API key required.** Quota is **strict** (~50 req/day per key for non-covers endpoints).
- Live-verified: ⚠️ Not fetched this session.

**Signal:** ratings + tag counts.
**Coverage:** small user base compared to Google/OL.
**Weakness:** the 50 req/day quota rules it out for our scale.

**Recommendation:** ❌ quota disqualifies.

---

### 13. Goodreads API — ⚠️ **DEPRECATED (2020)**

- 📄 Legacy docs: https://www.goodreads.com/api
- **No new API keys have been issued since December 2020.** Existing keys still work but no support.
- Amazon (parent) now surfaces Goodreads ratings inside their own products — no external programmatic access.

**Recommendation:** ❌ unavailable.

---

### 14. Bookscan / NPD Circana / BookStat

- 📄 Vendor page: https://www.circana.com/expertise/books/
- 💳 Pricing: **Enterprise sales — no public tier.** Historic contracts quoted publicly range **$10,000–$50,000+/year** depending on data package (verify via https://www.circana.com/contact/).
- Signal: **actual retail sales data** — publisher/retailer gold standard.

**Applicable to our scale:** ⚠️ only if the budget is available. If purchased, replaces every other source in this document.

---

### 15. Publishers Marketplace

- 📄 Homepage: https://www.publishersmarketplace.com/
- 💳 Pricing: **~$25/mo (~$300/yr)** subscription — https://www.publishersmarketplace.com/join.html
- Signal: industry deals, trending titles, new releases.
- Coverage: focused on new/upcoming releases and deal flow, not per-title popularity ranking.

**Applicable to our scale:** ⚠️ useful research subscription for the acquisitions team; **not a per-title API**.

---

### 16. Findaway / your audio distributor

If TRL distributes through **Findaway Voices** (columns like `findaway_price`, `product_id`, `retail_product_id` on `audio_metadata` strongly suggest this), the distributor likely exposes:
- Actual sales/rental counts (**your own** channel data)
- Trending titles on their platform
- Genre bestsellers

- 📄 Findaway public info: https://findawayvoices.com/
- 💳 Cost: **included in your existing distribution contract.** No incremental billing.

**Signal quality:** by definition perfect for **your own catalog** through that channel.

**Applicable to our scale:** ✅ **Ask Findaway's account manager first — before adding any more external sources.** Zero incremental cost, ground-truth data for your own catalog.

---

## Recommended future additions — ranked by ROI

| Priority | Change | Effort | Value |
|---|---|---|---|
| **P0** | Add **time-decay weighting** in the composer (~30 lines, no new external dep) — weight recent `audio_popularity_history` rows more than old ones | **Low** | **High** — sharpens "today" semantic without new source |
| **P0** | Ask **Findaway/distributor** for their sales/rental API — free & authoritative for your channel | Low (a phone call) | **Very high** |
| **P1** | Add **Spotify Audiobooks** popularity 0–100 (OAuth client-credentials flow) | Medium (new fetcher + OAuth registration) | **High** — best free "trending today" signal |
| **P1** | Add **Amazon Creators API** sales rank | Medium (SigV4 signing) + Associate account required | **Very high** IF Associate account exists |
| **P2** | Add **iTunes RSS chart** as boost-only signal (heavy weight when matched, ignored otherwise) | Low | Medium |
| **P2** | Add **NYT Audio Fiction/Nonfiction** lists as boost signals | Low (free key) | Medium |
| **P3** | Add **Wikipedia Pageviews** as cultural-attention tie-breaker | Low | Low |
| **P3** | Add **admin override** — pin a title as "featured" regardless of score | Low | Medium (UX win) |
| **P4** | Add **Reddit mention frequency** with relevance filtering | Medium | Low (noisy) |
| **Skip** | Google Trends (unofficial/fragile), LibraryThing (50 req/day cap), YouTube Data API (quota-unit cost), PA-API v5 (deprecated), Goodreads (deprecated) | — | — |

## Business questions to answer before investing further

1. **Does TRL have an active Amazon Associates account** with ≥10 qualifying sales in the past 30 days?
   → If yes: **Amazon Creators API is P1.** Verify `SalesRank` returns in a test call.
2. **Does Findaway (or your distributor) expose sales/rental APIs?**
   → If yes: **use it before any external source.** Free, ground-truth for your catalog.
3. **Is a budget line available for Bookscan?**
   → If yes: replaces every other free source. Reach out via https://www.circana.com/contact/
4. **Is the "no keys / no OAuth" constraint firm for Spotify?**
   → Spotify OAuth is app-level (not per-user); ergonomically similar to the Google Books API key. If acceptable: Spotify is our biggest free-signal win.

---

## Notes on this document

- All URLs above were current as of the version tag in `CURRENT_IMPLEMENTATION.md`. **Always click the pricing link before committing spend** — SaaS pricing changes.
- Live-verification status per source reflects what was reachable from this project's sandbox during initial research. Reddit, NYT dev portal, and some Google Cloud docs pages block outbound HTTPS from certain shared IPs. **These sources are backed by widely-documented public knowledge** but you should re-verify from your dev server's IP before making an integration commitment.
- If a source's pricing has changed and this doc is out of date, please PR an update.
