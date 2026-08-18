/**
 * Token-bucket rate limiter with a 429-triggered cooldown window.
 *
 * Base behaviour: hands out `requestsPerSecond` tokens per second; awaiters
 * that arrive when tokens are exhausted queue in FIFO order.
 *
 * Extra: `noteRateLimitHit()` — call this whenever the upstream API returns
 * a 429. If two 429s land inside a 60-second window, the limiter enters
 * cooldown: `acquire()` waits until `cooldownUntil` before serving any more
 * tokens. Protects our IP's reputation with the source.
 *
 * Zero external deps — one file, no npm packages.
 */

const COOLDOWN_WINDOW_MS = 60_000;
const COOLDOWN_DURATION_MS = 30_000;
const COOLDOWN_HITS_THRESHOLD = 2;

export class RateLimiter {
  private queue: Array<() => void> = [];
  private tokens: number;
  private lastRefill: number;
  private rateLimitHits: number[] = [];
  private cooldownUntil = 0;

  constructor(
    private readonly requestsPerSecond: number,
    private readonly burst: number = requestsPerSecond,
  ) {
    this.tokens = burst;
    this.lastRefill = Date.now();
  }

  /**
   * Called by the retry helper when the source returns 429. Two hits inside
   * COOLDOWN_WINDOW_MS opens a cooldown until now + COOLDOWN_DURATION_MS.
   * Existing cooldown is extended (not shortened) if another hit arrives.
   */
  noteRateLimitHit(): void {
    const now = Date.now();
    this.rateLimitHits.push(now);
    this.rateLimitHits = this.rateLimitHits.filter(
      (t) => now - t < COOLDOWN_WINDOW_MS,
    );
    if (this.rateLimitHits.length >= COOLDOWN_HITS_THRESHOLD) {
      this.cooldownUntil = Math.max(
        this.cooldownUntil,
        now + COOLDOWN_DURATION_MS,
      );
    }
  }

  async acquire(): Promise<void> {
    // Cooldown blocks all callers until it lapses. Deliberately awaited before
    // any token math — a source that just 429'd should get zero traffic.
    const now = Date.now();
    if (now < this.cooldownUntil) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.cooldownUntil - now),
      );
    }

    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.scheduleDrain();
    });
  }

  private refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    const added = elapsedSec * this.requestsPerSecond;
    if (added > 0) {
      this.tokens = Math.min(this.burst, this.tokens + added);
      this.lastRefill = now;
    }
  }

  private scheduleDrain() {
    const wait = Math.max(10, Math.ceil(1000 / this.requestsPerSecond));
    setTimeout(() => {
      this.refill();
      while (this.tokens >= 1 && this.queue.length > 0) {
        this.tokens -= 1;
        const resolve = this.queue.shift();
        resolve?.();
      }
      if (this.queue.length > 0) this.scheduleDrain();
    }, wait);
  }
}
