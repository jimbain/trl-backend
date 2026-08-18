/**
 * Common contract every popularity source implements.
 *
 * Adding a new source (Spotify, Wikipedia, etc.) is one new file that
 * implements this interface — the runner and composer stay untouched.
 *
 * `fetch()` MUST NOT throw for API-level failures (rate limit, 5xx, no match) —
 * return `null` and let the composer count it as a missed source.
 * Throw only for programmer errors (missing env, invalid input).
 */
export interface PopularityFetchInput {
  sku: string;
  title: string;
  authors: string[];
  isbn: string | null;
}

export interface PopularityFetchResult {
  /** 0–100 normalized sub-score */
  sub_score: number;
  /** Small evidence blob stored in the sources JSON for admin inspection */
  raw: Record<string, unknown>;
}

export interface PopularityFetcher {
  /** Stable identifier used as the source key in the `sources` JSON and app_configs weights */
  readonly name: string;

  /**
   * @returns the sub-score + raw evidence, or null when this source has no
   *          data for this audio (miss, no ISBN, API down, etc).
   */
  fetch(input: PopularityFetchInput): Promise<PopularityFetchResult | null>;

  /** True once the source has recorded N consecutive failures — runner will skip it */
  isCircuitOpen(): boolean;

  /** Called by the runner between runs to reset transient state */
  resetCircuit(): void;
}
