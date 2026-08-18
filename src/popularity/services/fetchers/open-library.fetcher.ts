import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { CacheService } from 'src/common/services/cache.service';
import { BaseFetcher } from './base-fetcher';
import {
  PopularityFetchInput,
  PopularityFetchResult,
} from './popularity-fetcher.interface';
import { RateLimiter } from './rate-limiter';
import { withRetry } from './retry.helper';

/**
 * ============================================================================
 *  Open Library — per-title reader-log popularity signal
 * ============================================================================
 *
 *  API used:      Open Library Search API (JSON)
 *  Base URL:      https://openlibrary.org/search.json
 *  Auth:          NONE. A User-Agent header identifying the caller is
 *                 strongly recommended (raises rate limit from 1 → 3 rps).
 *  Cost:          $0 — no signup, no key, no quota bill.
 *  Docs:          https://openlibrary.org/dev/docs/api/search
 *
 *  ------------------------------------------------------------
 *  How we call it
 *  ------------------------------------------------------------
 *
 *  Preferred (ISBN exact match — used when audio_metadata.isbn is set):
 *
 *    GET https://openlibrary.org/search.json
 *        ?q=isbn:9780062316097
 *        &fields=key,title,readinglog_count,already_read_count,
 *                want_to_read_count,currently_reading_count,
 *                ratings_count,ratings_average,edition_count
 *        &limit=1
 *
 *  Fallback (title + author fuzzy — used when ISBN is missing):
 *
 *    GET https://openlibrary.org/search.json
 *        ?q=title:"The Automatic Millionaire" author:"David Bach"
 *        &fields=... (same)
 *        &limit=1
 *
 *  Headers on every request:
 *    User-Agent: TRL/1.0 (+admin@therentallibrary.com)
 *
 *  ------------------------------------------------------------
 *  Response shape (verified live 2026)
 *  ------------------------------------------------------------
 *
 *  {
 *    "numFound": 1,
 *    "docs": [{
 *      "key": "/works/OL17075811W",
 *      "title": "Sapiens",
 *      "readinglog_count": 5904,      <-- primary signal we use
 *      "want_to_read_count": 5167,
 *      "currently_reading_count": 415,
 *      "already_read_count": 322,
 *      "ratings_count": 207,
 *      "ratings_average": 4.20,
 *      "edition_count": 86
 *    }]
 *  }
 *
 *  ------------------------------------------------------------
 *  Field we use for the sub-score
 *  ------------------------------------------------------------
 *
 *  `readinglog_count` — total distinct users who have this book on any
 *  shelf (want-to-read + currently-reading + already-read). Best single
 *  per-title engagement signal Open Library exposes.
 *
 *  Normalisation:  log10 curve over 5 orders of magnitude
 *    10 users     -> 20
 *    100 users    -> 40
 *    1 000 users  -> 60
 *    10 000 users -> 80
 *    100k+ users  -> 100
 *
 *  ------------------------------------------------------------
 *  Robustness
 *  ------------------------------------------------------------
 *
 *  - Rate-limited to 3 rps (their documented cap for identified callers).
 *  - Wrapped in a 24-hour Redis cache per (source, ISBN|query, YYYY-MM-DD)
 *    — reruns within the day never re-hit their servers.
 *  - Circuit breaker: after 5 consecutive network failures the source is
 *    marked open and the runner skips it for the rest of the batch; other
 *    sources still contribute so audios still get a score.
 *  - Errors are swallowed to `null`; only programmer mistakes throw.
 *
 *  Response fields we stash in `raw` (for the admin tooltip / audit):
 *    reading_log_count, want_to_read, currently_reading, already_read,
 *    ratings_count, ratings_average, edition_count, work_key
 * ============================================================================
 */

const SEARCH_URL = 'https://openlibrary.org/search.json';
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const RPS = 3;
const DEFAULT_UA = 'TRL/1.0 (+admin@therentallibrary.com)';

interface OpenLibrarySearchDoc {
  key?: string;
  title?: string;
  readinglog_count?: number;
  already_read_count?: number;
  want_to_read_count?: number;
  currently_reading_count?: number;
  ratings_count?: number;
  ratings_average?: number;
  edition_count?: number;
}

interface OpenLibrarySearchResponse {
  docs?: OpenLibrarySearchDoc[];
  numFound?: number;
}

@Injectable()
export class OpenLibraryFetcher extends BaseFetcher {
  readonly name = 'openlibrary';
  private readonly limiter = new RateLimiter(RPS);
  private readonly userAgent = process.env.POPULARITY_USER_AGENT ?? DEFAULT_UA;

  constructor(
    cache: CacheService,
    private readonly http: HttpService,
  ) {
    super(cache);
  }

  async warm(): Promise<void> {
    // No snapshot — per-title lookups only.
  }

  async fetch(
    input: PopularityFetchInput,
  ): Promise<PopularityFetchResult | null> {
    if (this.isCircuitOpen()) return null;

    // Try queries in preference order. Empty numFound on the first attempt
    // is not a "miss" for the source — audiobook-specific ISBNs frequently
    // aren't indexed by Open Library even when the same title IS. Falling
    // back to title+author recovers those.
    const queries = this.buildQueries(input);
    for (const query of queries) {
      const doc = await this.runOne(query);
      if (doc && (doc.readinglog_count ?? 0) > 0) {
        return this.toResult(doc, query.matchedBy);
      }
    }
    return null;
  }

  private async runOne(
    query: FetchQuery,
  ): Promise<OpenLibrarySearchDoc | null> {
    return this.cachedFetch<OpenLibrarySearchDoc | null>(
      query.cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        await this.limiter.acquire();
        try {
          const response = await withRetry(
            () =>
              firstValueFrom(
                this.http.get<OpenLibrarySearchResponse>(SEARCH_URL, {
                  params: {
                    q: query.q,
                    fields: [
                      'key',
                      'title',
                      'readinglog_count',
                      'already_read_count',
                      'want_to_read_count',
                      'currently_reading_count',
                      'ratings_count',
                      'ratings_average',
                      'edition_count',
                    ].join(','),
                    limit: 1,
                  },
                  headers: { 'User-Agent': this.userAgent },
                  timeout: 10_000,
                }),
              ),
            { onRateLimit: () => this.limiter.noteRateLimitHit() },
          );
          this.recordSuccess();
          const docs = response.data?.docs ?? [];
          return docs.length > 0 ? docs[0] : null;
        } catch (err: any) {
          // Only reached after withRetry exhausts retries or hits a
          // non-retryable status. Circuit breaker counts this as a real
          // failure.
          this.recordFailure(err?.message ?? String(err));
          return null;
        }
      },
    );
  }

  private toResult(
    doc: OpenLibrarySearchDoc,
    matchedBy: FetchQuery['matchedBy'],
  ): PopularityFetchResult {
    const readingLogCount = doc.readinglog_count ?? 0;
    const subScore = Math.round(
      Math.min(1, Math.log10(1 + readingLogCount) / 5) * 100,
    );
    return {
      sub_score: Math.max(0, Math.min(100, subScore)),
      raw: {
        matched_by: matchedBy,
        reading_log_count: readingLogCount,
        want_to_read: doc.want_to_read_count ?? null,
        currently_reading: doc.currently_reading_count ?? null,
        already_read: doc.already_read_count ?? null,
        ratings_count: doc.ratings_count ?? null,
        ratings_average: doc.ratings_average ?? null,
        edition_count: doc.edition_count ?? null,
        work_key: doc.key ?? null,
      },
    };
  }

  private buildQueries(input: PopularityFetchInput): FetchQuery[] {
    const queries: FetchQuery[] = [];

    // 1. ISBN exact match if we have one — fastest, most precise.
    if (input.isbn) {
      const isbn = input.isbn.replace(/[^0-9Xx]/g, '');
      if (isbn.length >= 10) {
        queries.push({
          q: `isbn:${isbn}`,
          cacheKey: `isbn:${isbn}`,
          matchedBy: 'isbn',
        });
      }
    }

    // 2. Title + author fuzzy fallback. Runs when ISBN is missing OR when
    // the ISBN query returns no docs (common for audiobook-only ISBNs that
    // Open Library doesn't index — the same title's print edition often is
    // indexed).
    const title = (input.title ?? '').trim();
    if (!title) return queries;
    const author = (input.authors[0] ?? '').trim();
    const q = author
      ? `title:${JSON.stringify(title)} author:${JSON.stringify(author)}`
      : `title:${JSON.stringify(title)}`;
    queries.push({
      q,
      cacheKey: `q:${title.toLowerCase()}|${author.toLowerCase()}`,
      matchedBy: 'title_author',
    });
    return queries;
  }
}

interface FetchQuery {
  q: string;
  cacheKey: string;
  matchedBy: 'isbn' | 'title_author';
}
