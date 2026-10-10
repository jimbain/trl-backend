import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { AppConfigService } from 'src/app-config/app-config.service';
import { Audio } from 'src/audios/entities/audio.entity';
import { CacheService } from 'src/common/services/cache.service';
import { AudioElasticsearchSyncService } from 'src/audios/audio-elasticsearch-sync.service';
import { AudioPopularityHistory } from '../entities/audio-popularity-history.entity';
import { AudioPopularityScore } from '../entities/audio-popularity-score.entity';
import {
  AudioPopularityRun,
  PopularityRunTrigger,
} from '../entities/audio-popularity-run.entity';
import { OpenLibraryFetcher } from './fetchers/open-library.fetcher';
import { PopularityFetcher } from './fetchers/popularity-fetcher.interface';
import {
  PopularityComposerService,
  SourceContribution,
} from './popularity-composer.service';

// Kept in sync with popularity.service.ts — extracted here so the runner can
// invalidate without importing the service (avoids a circular dep).
const CACHE_KEY_STATUS = 'popularity:status';
const CACHE_KEY_LIST_INDEX = 'popularity:list:_keys';

const CONFIG_WEIGHT_OPENLIBRARY = 'popularity_source_weight_openlibrary';

// Bounded per-audio concurrency. Each source has its own token-bucket
// limiter, so this only controls how many audios we start simultaneously.
// At 8 in-flight audios × 2 sources each, we're bounded by the slowest
// source's rate limit (Open Library at 3 rps with User-Agent) — a
// full 2500-audio run completes in ~15 min uncached, ~30 s from cache.
const AUDIO_CONCURRENCY = 8;
const HARD_TIMEOUT_MS = 3 * 60 * 60 * 1000;

interface RunOptions {
  triggeredBy: PopularityRunTrigger;
}

@Injectable()
export class PopularityRunnerService {
  private readonly logger = new Logger(PopularityRunnerService.name);
  private inFlight: Promise<AudioPopularityRun> | null = null;

  constructor(
    @InjectRepository(AudioPopularityRun)
    private readonly runsRepo: Repository<AudioPopularityRun>,
    @InjectRepository(AudioPopularityScore)
    private readonly scoresRepo: Repository<AudioPopularityScore>,
    @InjectRepository(AudioPopularityHistory)
    private readonly historyRepo: Repository<AudioPopularityHistory>,
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,
    private readonly appConfigService: AppConfigService,
    private readonly composer: PopularityComposerService,
    private readonly openLibrary: OpenLibraryFetcher,
    private readonly cache: CacheService,
    private readonly audioEsSync: AudioElasticsearchSyncService,
  ) {}

  isRunning(): boolean {
    return this.inFlight !== null;
  }

  async start(options: RunOptions): Promise<AudioPopularityRun> {
    if (this.inFlight) {
      throw new ConflictException(
        'A popularity regeneration is already in progress.',
      );
    }

    const run = this.runsRepo.create({
      batch_id: crypto.randomUUID(),
      status: 'pending',
      stage: null,
      triggered_by: options.triggeredBy,
      completed_at: null,
      audios_processed: null,
      audios_matched: null,
      error_message: null,
    });
    await this.runsRepo.save(run);

    this.inFlight = this.execute(run).finally(() => {
      this.inFlight = null;
    });
    this.inFlight.catch((err) => {
      this.logger.error(`run ${run.id} failed: ${err.message}`, err.stack);
    });
    return run;
  }

  /**
   * Same as `start()`, but resolves only when the pipeline reaches a terminal
   * state (success/failed). Used by the `popularity:seed` CLI command which
   * needs to block until the initial batch is written, then exit.
   *
   * Returns the FINAL run row (with completed_at / audios_matched populated).
   * Never throws — errors are captured in run.error_message.
   */
  async startAndWait(options: RunOptions): Promise<AudioPopularityRun> {
    const pending = await this.start(options);
    // Capture inFlight before the .finally() clears it back to null.
    const inFlight = this.inFlight;
    if (inFlight) {
      try {
        return await inFlight;
      } catch {
        // execute() writes error_message onto the row and re-throws; the row
        // is already persisted, so fetch its terminal state.
      }
    }
    const latest = await this.runsRepo.findOne({
      where: { batch_id: pending.batch_id },
    });
    return latest ?? pending;
  }

  private async execute(run: AudioPopularityRun): Promise<AudioPopularityRun> {
    const deadline = Date.now() + HARD_TIMEOUT_MS;

    try {
      await this.updateRun(run, { status: 'running', stage: 'fetching' });

      const weights = await this.loadWeights();
      const version = this.composer.versionKey(weights);
      this.logger.log(
        `weights: ${JSON.stringify(weights)} (version=${version})`,
      );

      // Reset per-run circuit state and warm any snapshot fetchers.
      // Both fetchers are per-title (no chart snapshot); warm() is a no-op
      // for both but we call it to keep the interface honest.
      const fetchers: PopularityFetcher[] = [this.openLibrary];
      fetchers.forEach((f) => f.resetCircuit());
      await this.openLibrary.warm();

      // Load only active audios — per user's decision, popularity is about
      // "what of our current catalog is trending", not discovery.
      const audios = await this.audioRepo.find({
        where: { is_active: true },
        relations: ['metadata'],
        // Deterministic. Without it Postgres returns rows in whatever order it
        // likes, so a run that stops early — hard timeout, circuit breaker,
        // restart — covers a different arbitrary subset each night and scores
        // jitter with no change in the underlying data.
        order: { sku: 'ASC' },
      });
      this.logger.log(`scoring ${audios.length} active audios`);

      const scoreRows: AudioPopularityScore[] = [];
      const historyRows: AudioPopularityHistory[] = [];
      let processed = 0;
      let matched = 0;
      // Per source, not just the total. `matched` only says "something
      // matched"; with more than one source it cannot distinguish a healthy
      // run from one where a source has died, which is how Google Books went
      // 37 nights contributing nothing while every run reported success.
      const sourceMatches: Record<string, number> = Object.fromEntries(
        fetchers.map((f) => [f.name, 0]),
      );

      // Process audios in small concurrent batches — bounded parallelism.
      for (let i = 0; i < audios.length; i += AUDIO_CONCURRENCY) {
        if (Date.now() > deadline) {
          throw new Error('hard timeout exceeded');
        }
        const slice = audios.slice(i, i + AUDIO_CONCURRENCY);
        const contributions = await Promise.all(
          slice.map((audio) => this.scoreOne(audio, fetchers)),
        );
        for (let j = 0; j < slice.length; j++) {
          const audio = slice[j];
          const composed = this.composer.compose(contributions[j], weights);
          processed += 1;
          if (composed.confidence > 0) matched += 1;
          for (const [name, detail] of Object.entries(composed.sources)) {
            if (detail?.matched) sourceMatches[name] += 1;
          }

          scoreRows.push(
            this.scoresRepo.create({
              sku: audio.sku,
              popularity_score: composed.popularity_score,
              confidence: composed.confidence,
              sources: composed.sources,
              source_weights_version: version,
            }),
          );
          historyRows.push(
            this.historyRepo.create({
              sku: audio.sku,
              batch_id: run.batch_id,
              popularity_score: composed.popularity_score,
              confidence: composed.confidence,
              sources: composed.sources,
              source_weights_version: version,
            }),
          );
        }

        if ((i / AUDIO_CONCURRENCY) % 25 === 0) {
          this.logger.debug(
            `progress: ${processed}/${audios.length} (matched=${matched}, ` +
              `${JSON.stringify(sourceMatches)})`,
          );
        }
      }

      await this.updateRun(run, { stage: 'writing' });

      // Upsert current view (one row per sku). Insert history append-only.
      // Both wrapped in a transaction so a mid-write failure leaves the
      // previous batch intact.
      await this.scoresRepo.manager.transaction(async (tx) => {
        // Chunk to avoid parameter-count limits on huge inserts (~5k audios ok).
        const chunkSize = 500;
        for (let i = 0; i < scoreRows.length; i += chunkSize) {
          await tx
            .createQueryBuilder()
            .insert()
            .into(AudioPopularityScore)
            .values(scoreRows.slice(i, i + chunkSize))
            .orUpdate(
              [
                'popularity_score',
                'confidence',
                'sources',
                'source_weights_version',
                'computed_at',
              ],
              ['sku'],
            )
            .execute();
        }
        for (let i = 0; i < historyRows.length; i += chunkSize) {
          await tx
            .createQueryBuilder()
            .insert()
            .into(AudioPopularityHistory)
            .values(historyRows.slice(i, i + chunkSize))
            .execute();
        }
      });

      // A source that matched nothing across the whole catalogue is broken,
      // not unlucky. Reporting that as `success` is what let Google Books fail
      // silently for 37 nights.
      const deadSources = Object.entries(sourceMatches)
        .filter(([, n]) => n === 0)
        .map(([name]) => name);
      if (deadSources.length) {
        this.logger.error(
          `source(s) matched ZERO of ${processed} audios: ${deadSources.join(', ')} ` +
            '— run marked partial. Check the fetcher and its upstream API.',
        );
      }

      await this.updateRun(run, {
        status: deadSources.length ? 'partial' : 'success',
        stage: 'done',
        completed_at: new Date(),
        audios_processed: processed,
        audios_matched: matched,
        source_match_counts: sourceMatches,
      });

      // Fresh batch committed — drop cached list pages + status so the next
      // admin request sees the new numbers immediately.
      await this.invalidateReadCache();
      this.syncAudiosToElasticsearch(audios.map((a) => a.id));
      return run;
    } catch (err: any) {
      await this.updateRun(run, {
        status: 'failed',
        completed_at: new Date(),
        error_message: err?.message ?? String(err),
      });
      throw err;
    }
  }

  private async scoreOne(
    audio: Audio,
    fetchers: PopularityFetcher[],
  ): Promise<SourceContribution[]> {
    const input = {
      sku: audio.sku,
      title: audio.display_title ?? audio.metadata?.title ?? '',
      authors: audio.display_authors ?? audio.metadata?.authors ?? [],
      isbn: audio.metadata?.isbn ?? null,
    };

    return Promise.all(
      fetchers.map(async (f) => {
        if (f.isCircuitOpen()) {
          return { name: f.name, sub_score: null };
        }
        try {
          const result = await f.fetch(input);
          if (!result) return { name: f.name, sub_score: null };
          return {
            name: f.name,
            sub_score: result.sub_score,
            raw: result.raw,
          };
        } catch (err: any) {
          this.logger.debug(
            `${f.name} failed for ${audio.sku}: ${err?.message}`,
          );
          return { name: f.name, sub_score: null };
        }
      }),
    );
  }

  /**
   * Kept in sync with `PopularityService.invalidateReadCache()`. Inlined
   * here (not delegated) to avoid a circular DI dependency: runner ->
   * service -> runner. Trades DRY for correctness — worth it.
   */
  private async invalidateReadCache(): Promise<void> {
    try {
      const client = this.cache.getClient();
      const keys = await client.smembers(CACHE_KEY_LIST_INDEX);
      if (keys.length > 0) await client.del(...keys);
      await Promise.all([
        client.del(CACHE_KEY_LIST_INDEX),
        this.cache.delete(CACHE_KEY_STATUS),
      ]);
    } catch (err: any) {
      this.logger.warn(`popularity cache invalidation failed: ${err?.message}`);
    }
  }

  private syncAudiosToElasticsearch(audioIds: string[]): void {
    const CHUNK = 10;
    const chunks: string[][] = [];
    for (let i = 0; i < audioIds.length; i += CHUNK) {
      chunks.push(audioIds.slice(i, i + CHUNK));
    }
    const runChunks = async () => {
      for (const chunk of chunks) {
        await Promise.allSettled(
          chunk.map((id) => this.audioEsSync.syncAudioById(id)),
        );
      }
      this.logger.log(
        `ES: synced ${audioIds.length} audio docs after popularity run`,
      );
    };
    runChunks().catch((err: any) =>
      this.logger.warn(`ES sync after popularity failed: ${err?.message}`),
    );
  }

  /**
   * Open Library is the only source.
   *
   * Google Books was removed rather than weighted to zero. Its field-scoped
   * operators — isbn:, intitle:, inauthor: — all return zero results from the
   * public v1 API, which is why it matched 0 of 2,025 titles across 37 runs.
   * Free text does return, but only ~36% of results carry a rating and a third
   * of those are the wrong book (one title resolved to "Catalog of Copyright
   * Entries"), and the ratings that do exist have counts in the single digits.
   * A rating from four people is not a popularity signal worth a second
   * external dependency, its quota, circuit breaker and match-verification
   * gate. Open Library returns reading-log counts in the tens of thousands.
   *
   * The weight is retained as a config knob so the value stays visible and
   * auditable on each score row, even though a single source normalises to
   * itself: compose() divides by the matched weight sum.
   */
  private async loadWeights(): Promise<Record<string, number>> {
    const configs = await this.appConfigService.getAppConfigs([
      CONFIG_WEIGHT_OPENLIBRARY,
    ]);
    return {
      openlibrary: this.parseWeight(configs[CONFIG_WEIGHT_OPENLIBRARY], 1),
    };
  }

  private parseWeight(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  private updateRun(
    run: AudioPopularityRun,
    patch: Partial<AudioPopularityRun>,
  ): Promise<AudioPopularityRun> {
    Object.assign(run, patch);
    return this.runsRepo.save(run);
  }
}
