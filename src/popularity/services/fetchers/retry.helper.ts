import { AxiosError, AxiosResponse } from 'axios';

/**
 * ============================================================================
 *  withRetry — HTTP retry helper for external popularity fetchers
 * ============================================================================
 *
 *  Wraps any promise-returning axios call. Retries transient upstream
 *  failures automatically; passes anything permanent through unchanged.
 *
 *  Retryable status codes:  429, 502, 503, 504
 *  Retryable network errors: ECONNRESET, ETIMEDOUT, ECONNABORTED,
 *                            ENETUNREACH, EAI_AGAIN
 *  Everything else (400, 401, 403, 404, other 4xx, non-network errors) is
 *  NON-retryable and thrown to the caller on the first hit.
 *
 *  Backoff:
 *    - Default delays: 500ms, 1500ms, 4000ms (before attempts 2, 3, giving
 *      up).
 *    - Plus 0–300ms jitter per attempt to avoid thundering herds when a
 *      whole batch of audios hit the same 503.
 *    - On 429: if the response includes a `Retry-After` header (either
 *      seconds or an HTTP-date), THAT wins — capped at 60 s so a hostile
 *      header can't stall a run for hours.
 *
 *  Cooldown hook:
 *    - Pass `hooks.onRateLimit` to be notified when a 429 arrives (before
 *      the delay). Fetchers use this to feed their RateLimiter's
 *      `noteRateLimitHit()` — two 429s within 60 s open a source-wide
 *      cooldown that blocks new requests for 30 s.
 *
 *  Circuit-breaker interaction:
 *    - The BaseFetcher's `recordFailure()` is called only if withRetry
 *      RE-THROWS after exhausting attempts — transient blips don't count.
 * ============================================================================
 */

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ENETUNREACH',
  'EAI_AGAIN',
]);
const DEFAULT_ATTEMPTS = 3;
const BASE_DELAYS_MS = [500, 1500, 4000];
const JITTER_MAX_MS = 300;
const RETRY_AFTER_CAP_MS = 60_000;

export interface RetryHooks {
  /** Called once per 429 received (before the delay). Fetchers use this to
   *  update their RateLimiter cooldown state. Should NOT throw. */
  onRateLimit?: () => void;
}

export async function withRetry<T>(
  fn: () => Promise<AxiosResponse<T>>,
  hooks: RetryHooks = {},
): Promise<AxiosResponse<T>> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < DEFAULT_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = getStatus(err);
      const retryable =
        status !== undefined
          ? RETRYABLE_STATUS.has(status)
          : isRetryableNetworkError(err);

      // Non-retryable → surface immediately.
      if (!retryable) throw err;

      // 429-specific: tell the caller so it can open a cooldown.
      if (status === 429) {
        try {
          hooks.onRateLimit?.();
        } catch {
          /* hook errors should never break the request path */
        }
      }

      // Out of attempts → re-throw so the caller counts a real failure.
      if (attempt === DEFAULT_ATTEMPTS - 1) throw err;

      const delayMs = computeDelay(attempt, status, err);
      await sleep(delayMs);
    }
  }
  // Unreachable — the loop either returns or throws — but TS wants it.
  throw lastErr;
}

function computeDelay(
  attempt: number,
  status: number | undefined,
  err: unknown,
): number {
  const jitter = Math.floor(Math.random() * JITTER_MAX_MS);
  if (status === 429) {
    const retryAfterMs = parseRetryAfter(err);
    if (retryAfterMs !== null)
      return Math.min(retryAfterMs, RETRY_AFTER_CAP_MS);
  }
  return BASE_DELAYS_MS[attempt] + jitter;
}

function getStatus(err: unknown): number | undefined {
  return (err as AxiosError | undefined)?.response?.status;
}

function isRetryableNetworkError(err: unknown): boolean {
  const code = (err as AxiosError | undefined)?.code;
  return code !== undefined && RETRYABLE_NETWORK_CODES.has(code);
}

function parseRetryAfter(err: unknown): number | null {
  const header = (err as AxiosError | undefined)?.response?.headers?.[
    'retry-after'
  ];
  if (!header) return null;
  const raw = String(header).trim();
  // Retry-After can be delta-seconds OR an HTTP-date.
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }
  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) {
    return Math.max(0, asDate.getTime() - Date.now());
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
