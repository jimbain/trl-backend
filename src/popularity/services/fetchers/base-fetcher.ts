import { Logger } from '@nestjs/common';
import { CacheService } from 'src/common/services/cache.service';
import { PopularityFetcher } from './popularity-fetcher.interface';

/**
 * Shared plumbing every fetcher wants: circuit breaker + Redis cache helper.
 * Fetchers extend this and implement `fetch()` — everything else is inherited.
 */
export abstract class BaseFetcher implements PopularityFetcher {
  abstract readonly name: string;

  protected readonly logger: Logger;
  private consecutiveFailures = 0;
  private circuitOpen = false;
  private readonly failureThreshold = 5;

  constructor(protected readonly cache: CacheService) {
    this.logger = new Logger(this.constructor.name);
  }

  abstract fetch(input: any): Promise<any>;

  isCircuitOpen(): boolean {
    return this.circuitOpen;
  }

  resetCircuit(): void {
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
  }

  protected recordSuccess() {
    this.consecutiveFailures = 0;
  }

  protected recordFailure(reason: string) {
    this.consecutiveFailures += 1;
    if (
      this.consecutiveFailures >= this.failureThreshold &&
      !this.circuitOpen
    ) {
      this.circuitOpen = true;
      this.logger.warn(
        `circuit opened after ${this.consecutiveFailures} consecutive failures: ${reason}`,
      );
    }
  }

  /**
   * Wrap any raw HTTP fetch in a per-day cache — reruns within the TTL never
   * re-hit the source. Cache key encodes source name + logical key + date.
   */
  protected async cachedFetch<T>(
    logicalKey: string,
    ttlSeconds: number,
    fetcher: () => Promise<T | null>,
  ): Promise<T | null> {
    const day = new Date().toISOString().slice(0, 10);
    const key = `pop:${this.name}:${logicalKey}:${day}`;
    const hit = (await this.cache.get(key)) as T | null;
    if (hit !== null && hit !== undefined) return hit;
    const value = await fetcher();
    if (value !== null && value !== undefined) {
      await this.cache.set(key, value, ttlSeconds);
    }
    return value;
  }
}
