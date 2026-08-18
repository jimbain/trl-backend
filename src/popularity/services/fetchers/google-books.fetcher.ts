import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 *  Google Books — per-title ratings + review-volume signal
 * ============================================================================
 *
 *  API used:      Google Books API v1 (Volumes: list)
 *  Base URL:      https://www.googleapis.com/books/v1/volumes
 *  Auth:          Optional API key. Works without one but subject to a
 *                 lower per-IP quota; strongly recommended for any real
 *                 workload beyond dev poking.
 *  Cost:          $0 for the free tier (default ~1000 req/day per project
 *                 without key; up to 100k+/day per project with key).
 *  Docs:          https://developers.google.com/books/docs/v1/using
 *  Key signup:    https://console.cloud.google.com/apis/library/books.googleapis.com
 *
 *  ------------------------------------------------------------
 *  How we call it
 *  ------------------------------------------------------------
 *
 *  Preferred (ISBN exact match — used when audio_metadata.isbn is set):
 *
 *    GET https://www.googleapis.com/books/v1/volumes
 *        ?q=isbn:9780062316097
 *        &maxResults=5
 *        &printType=books
 *        &key=<GOOGLE_BOOKS_API_KEY>  (added iff env var set)
 *
 *  Fallback (title + author fuzzy — used when ISBN is missing):
 *
 *    GET https://www.googleapis.com/books/v1/volumes
 *        ?q=intitle:"The Automatic Millionaire" inauthor:"David Bach"
 *        &maxResults=5
 *        &printType=books
 *        &key=<GOOGLE_BOOKS_API_KEY>
 *
 *  We fetch 5 results and prefer the first one that has BOTH a rating
 *  and a rating count > 0. Google's first result is usually the most
 *  relevant edition but occasionally lacks rating data on the specific
 *  edition; picking the best-rated match avoids a null score just
 *  because a rare printing was returned first.
 *
 *  ------------------------------------------------------------
 *  Response shape
 *  ------------------------------------------------------------
 *
 *  {
 *    "kind": "books#volumes",
 *    "totalItems": 5,
 *    "items": [{
 *      "volumeInfo": {
 *        "title": "Sapiens: A Brief History of Humankind",
 *        "authors": ["Yuval Noah Harari"],
 *        "averageRating": 4.5,
 *        "ratingsCount": 1287,
 *        "industryIdentifiers": [
 *          { "type": "ISBN_13", "identifier": "9780062316097" },
 *          { "type": "ISBN_10", "identifier": "0062316095" }
 *        ]
 *      }
 *    }, ...]
 *  }
 *
 *  ------------------------------------------------------------
 *  Sub-score formula
 *  ------------------------------------------------------------
 *
 *      sub_score = averageRating × 20 × min(1, log10(1 + ratingsCount) / 4)
 *
 *    Star rating scaled 0–100 (rating × 20).
 *    Volume multiplier caps at 1.0 when ratingsCount ≥ 10 000.
 *    A 4.9 with 3 ratings scores ~29; a 4.3 with 3000 ratings scores ~74.
 *
 *  ------------------------------------------------------------
 *  Robustness
 *  ------------------------------------------------------------
 *
 *  - Rate-limited to 5 rps (conservative; Google's real cap is much
 *    higher with a key, ~100 QPS/project).
 *  - Wrapped in a 24-hour Redis cache per (source, ISBN|query, YYYY-MM-DD).
 *  - Circuit breaker trips after 5 consecutive failures (429 / 5xx),
 *    other sources still contribute.
 *  - `null` return = source miss (no match, no rating data, or quota hit).
 *    Never throws upward — programmer errors only.
 *
 *  Response fields we stash in `raw` (for the admin tooltip / audit):
 *    average_rating, ratings_count, matched_title, matched_authors, query
 * ============================================================================
 */

const VOLUMES_URL = 'https://www.googleapis.com/books/v1/volumes';
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const RPS = 5;

interface GoogleVolumeItem {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    averageRating?: number;
    ratingsCount?: number;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
  };
}

interface GoogleVolumesResponse {
  items?: GoogleVolumeItem[];
  totalItems?: number;
}

@Injectable()
export class GoogleBooksFetcher extends BaseFetcher {
  readonly name = 'google';
  private readonly limiter = new RateLimiter(RPS);

  constructor(
    cache: CacheService,
    private readonly http: HttpService,
    private readonly config: ConfigService,
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

    // Try ISBN first, then title+author. Same rationale as OpenLibrary:
    // audiobook-specific ISBNs may not be in Google's catalog even when the
    // print/ebook edition is — the fallback recovers those.
    const queries = this.buildQueries(input);
    for (const query of queries) {
      const item = await this.runOne(query);
      const rating = item?.volumeInfo?.averageRating ?? 0;
      const count = item?.volumeInfo?.ratingsCount ?? 0;
      if (item && rating > 0 && count > 0) {
        return this.toResult(item, query);
      }
    }
    return null;
  }

  private async runOne(query: FetchQuery): Promise<GoogleVolumeItem | null> {
    return this.cachedFetch<GoogleVolumeItem | null>(
      query.cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        await this.limiter.acquire();
        try {
          const apiKey = this.config.get<string>('GOOGLE_BOOKS_API_KEY');
          const params: Record<string, string> = {
            q: query.q,
            maxResults: '5',
            printType: 'books',
          };
          if (apiKey) params.key = apiKey;

          const response = await withRetry(
            () =>
              firstValueFrom(
                this.http.get<GoogleVolumesResponse>(VOLUMES_URL, {
                  params,
                  timeout: 10_000,
                }),
              ),
            { onRateLimit: () => this.limiter.noteRateLimitHit() },
          );
          this.recordSuccess();
          const items = response.data?.items ?? [];
          if (items.length === 0) return null;
          // Prefer the first item with both rating and count — fallback to
          // the top match if none of the 5 have rating data.
          const bestRated = items.find(
            (it) =>
              typeof it.volumeInfo?.averageRating === 'number' &&
              typeof it.volumeInfo?.ratingsCount === 'number' &&
              (it.volumeInfo?.ratingsCount ?? 0) > 0,
          );
          return bestRated ?? items[0];
        } catch (err: any) {
          // Only reached after withRetry exhausts attempts. Circuit breaker
          // counts this as a real failure.
          this.recordFailure(err?.message ?? String(err));
          return null;
        }
      },
    );
  }

  private toResult(
    item: GoogleVolumeItem,
    query: FetchQuery,
  ): PopularityFetchResult {
    const info = item.volumeInfo!;
    const rating = info.averageRating ?? 0;
    const count = info.ratingsCount ?? 0;
    const volumeMultiplier = Math.min(1, Math.log10(1 + count) / 4);
    const subScore = Math.round(rating * 20 * volumeMultiplier);
    return {
      sub_score: Math.max(0, Math.min(100, subScore)),
      raw: {
        matched_by: query.matchedBy,
        average_rating: rating,
        ratings_count: count,
        matched_title: info.title,
        matched_authors: info.authors,
        query: query.q,
      },
    };
  }

  private buildQueries(input: PopularityFetchInput): FetchQuery[] {
    const queries: FetchQuery[] = [];

    // 1. ISBN exact match if we have one.
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

    // 2. Title + author fallback (runs when ISBN missing OR ISBN returned
    // zero items OR zero ratings — audiobook-only ISBNs frequently aren't
    // in Google's catalog but the print edition of the same title is).
    const title = (input.title ?? '').trim();
    if (!title) return queries;
    const author = (input.authors[0] ?? '').trim();
    const q = author
      ? `intitle:${JSON.stringify(title)} inauthor:${JSON.stringify(author)}`
      : `intitle:${JSON.stringify(title)}`;
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
