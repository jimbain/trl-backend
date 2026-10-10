import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { Brackets, In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import { CacheService } from 'src/common/services/cache.service';
import { PaginationMeta } from 'src/common/interfaces';
import { ListPopularityDto } from '../dto/list-popularity.dto';
import {
  PopularityAudioDto,
  PopularityListDto,
  PopularityStatusDto,
} from '../dto/popularity-response.dto';
import { AudioPopularityScore } from '../entities/audio-popularity-score.entity';
import {
  AudioPopularityRun,
  COMPLETED_RUN_STATUSES,
} from '../entities/audio-popularity-run.entity';
import { PopularityRunnerService } from './popularity-runner.service';

const CONFIG_INTERVAL = 'popularity_interval_days';
const CONFIG_MIN_CONF = 'popularity_min_confidence_display';
const CONFIG_WEIGHTS = ['popularity_source_weight_openlibrary'];
const DEFAULT_INTERVAL_DAYS = 1;

// Read-path caching. These endpoints are polled heavily by the admin panel
// (5s status polling while runs are active, plus browsing the list). Caching
// keeps the DB out of the hot path even under thousands of concurrent
// polling clients. Short TTL keeps freshness reasonable; explicit
// invalidation happens on run completion (see runner service).
const LIST_CACHE_TTL_SECONDS = 60;
const STATUS_CACHE_TTL_SECONDS = 15;
const CACHE_KEY_LIST_PREFIX = 'popularity:list:';
const CACHE_KEY_STATUS = 'popularity:status';
const CACHE_KEY_LIST_INDEX = 'popularity:list:_keys';

@Injectable()
export class PopularityService implements OnModuleInit {
  private readonly logger = new Logger(PopularityService.name);

  constructor(
    @InjectRepository(AudioPopularityScore)
    private readonly scoresRepo: Repository<AudioPopularityScore>,
    @InjectRepository(AudioPopularityRun)
    private readonly runsRepo: Repository<AudioPopularityRun>,
    @InjectRepository(AudioMetadata)
    private readonly audioMetadataRepo: Repository<AudioMetadata>,
    private readonly runner: PopularityRunnerService,
    private readonly appConfigService: AppConfigService,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit() {
    // Non-fatal bootstrap check. Wrapped so a missing migration never blocks
    // backend startup.
    try {
      const [count, lastSuccess] = await Promise.all([
        this.scoresRepo.count(),
        this.runsRepo.findOne({
          where: { status: In(COMPLETED_RUN_STATUSES) },
          order: { completed_at: 'DESC' },
        }),
      ]);
      if (count === 0 && !lastSuccess) {
        this.logger.warn(
          'audio_popularity_scores is empty and no successful run recorded. ' +
            'Trigger the first "Generate" from Admin > AI Recommendation > Popularity.',
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `Popularity bootstrap check skipped: ${err?.message}. Have migrations been run?`,
      );
    }
  }

  async list(query: ListPopularityDto): Promise<PopularityListDto> {
    // Read-through cache — thousands of admins can hit this without
    // stampeding the DB. Cache is invalidated on run completion + on
    // manual regenerate (see invalidateReadCache).
    const cacheKey = this.listCacheKey(query);
    const cached = (await this.cache.get(cacheKey)) as PopularityListDto | null;
    if (cached) return cached;

    const result = await this.executeList(query);

    await Promise.all([
      this.cache.set(cacheKey, result, LIST_CACHE_TTL_SECONDS),
      // Track this key in a Redis set so invalidation can drop every
      // permutation without scanning the keyspace.
      this.cache.getClient().sadd(CACHE_KEY_LIST_INDEX, cacheKey),
    ]);
    return result;
  }

  private async executeList(
    query: ListPopularityDto,
  ): Promise<PopularityListDto> {
    const { page, per_page, min_score, max_score, min_confidence, search } =
      query;

    const qb = this.scoresRepo
      .createQueryBuilder('score')
      // NULLS LAST is required, not cosmetic: Postgres sorts NULL first on
      // DESC, so without it the ~1,100 unmeasured titles would occupy page 1
      // of the Popularity list ahead of every real score.
      .orderBy('score.popularity_score', 'DESC', 'NULLS LAST')
      .addOrderBy('score.confidence', 'DESC')
      // Stable tiebreak so OFFSET paging can't repeat or skip rows across
      // pages — large blocks now share a score (or share NULL).
      .addOrderBy('score.sku', 'ASC');

    if (typeof min_score === 'number')
      qb.andWhere('score.popularity_score >= :min_score', { min_score });
    if (typeof max_score === 'number')
      qb.andWhere('score.popularity_score <= :max_score', { max_score });
    if (typeof min_confidence === 'number')
      qb.andWhere('score.confidence >= :min_confidence', { min_confidence });

    if (search) {
      // Join to audio_metadata (not audios) so we can search title even when
      // the parent audios row is missing / soft-deleted. Simple ILIKE — the
      // popularity set is only a few thousand rows.
      qb.innerJoin(AudioMetadata, 'meta_search', 'meta_search.sku = score.sku');
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('meta_search.title ILIKE :s', { s: `%${search}%` })
            .orWhere('score.sku ILIKE :s', { s: `%${search}%` });
        }),
      );
    }

    const [rows, total] = await qb
      .skip((page - 1) * per_page)
      .take(per_page)
      .getManyAndCount();

    // Query audio_metadata directly for title/authors/cover_url. Robust:
    // even if the parent audios row is missing / soft-deleted / inactive,
    // the metadata is still there and the row renders correctly.
    const skus = rows.map((r) => r.sku);
    const metadatas = skus.length
      ? await this.audioMetadataRepo.find({
          where: { sku: In(skus) },
          select: ['sku', 'title', 'authors', 'cover_url'],
        })
      : [];
    const metaBySku = new Map(metadatas.map((m) => [m.sku, m]));

    // Pre-shape each item — DTO only enforces exposure, no @Transform.
    const items = rows.map((row) => {
      const meta = metaBySku.get(row.sku);
      return {
        sku: row.sku,
        title: meta?.title ?? null,
        authors: meta?.authors ?? [],
        image_url: meta?.cover_url ?? null,
        popularity_score: row.popularity_score,
        confidence: row.confidence,
        sources: row.sources,
        computed_at: row.computed_at,
      };
    });

    const latestRun = await this.runsRepo.findOne({
      where: { status: In(COMPLETED_RUN_STATUSES) },
      order: { completed_at: 'DESC' },
    });

    return plainToInstance(
      PopularityListDto,
      {
        data: items,
        meta: this.buildMeta(page, per_page, total),
        batch_id: latestRun?.batch_id ?? null,
        computed_at: latestRun?.completed_at ?? null,
      },
      { excludeExtraneousValues: true },
    );
  }

  private buildMeta(
    page: number,
    perPage: number,
    total: number,
  ): PaginationMeta {
    const last_page = Math.max(1, Math.ceil(total / perPage));
    const from = total === 0 ? null : (page - 1) * perPage + 1;
    const to = total === 0 ? null : Math.min(total, page * perPage);
    return {
      current_page: page,
      per_page: perPage,
      total,
      last_page,
      from,
      to,
    };
  }

  async getOne(sku: string): Promise<PopularityAudioDto> {
    const score = await this.scoresRepo.findOne({ where: { sku } });
    if (!score)
      throw new NotFoundException(`No popularity score for sku ${sku}`);

    // Direct metadata lookup — same rationale as executeList().
    const meta = await this.audioMetadataRepo.findOne({
      where: { sku },
      select: ['sku', 'title', 'authors', 'cover_url'],
    });

    return plainToInstance(
      PopularityAudioDto,
      {
        sku: score.sku,
        title: meta?.title ?? null,
        authors: meta?.authors ?? [],
        image_url: meta?.cover_url ?? null,
        popularity_score: score.popularity_score,
        confidence: score.confidence,
        sources: score.sources,
        computed_at: score.computed_at,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getStatus(): Promise<PopularityStatusDto> {
    // Status is polled every 5s by any admin viewing the popularity page.
    // 15s cache means at most 4 DB hits/minute regardless of how many
    // admins are watching. If runner is running, bypass cache so the UI
    // sees the flip to 'success' promptly.
    if (!this.runner.isRunning()) {
      const cached = (await this.cache.get(
        CACHE_KEY_STATUS,
      )) as PopularityStatusDto | null;
      if (cached) return cached;
    }

    const status = await this.executeGetStatus();
    if (!this.runner.isRunning()) {
      await this.cache.set(CACHE_KEY_STATUS, status, STATUS_CACHE_TTL_SECONDS);
    }
    return status;
  }

  private async executeGetStatus(): Promise<PopularityStatusDto> {
    const [latestRuns, lastSuccessRuns, configs] = await Promise.all([
      this.runsRepo.find({ order: { started_at: 'DESC' }, take: 1 }),
      this.runsRepo.find({
        where: { status: In(COMPLETED_RUN_STATUSES) },
        order: { completed_at: 'DESC' },
        take: 1,
      }),
      this.appConfigService.getAppConfigs([
        CONFIG_INTERVAL,
        CONFIG_MIN_CONF,
        ...CONFIG_WEIGHTS,
      ]),
    ]);

    const latestRun = latestRuns[0] ?? null;
    const lastSuccess = lastSuccessRuns[0] ?? null;
    const intervalDays = this.parsePositiveInt(
      configs[CONFIG_INTERVAL],
      DEFAULT_INTERVAL_DAYS,
    );

    let nextScheduledAt: Date | null = null;
    if (lastSuccess?.completed_at) {
      nextScheduledAt = new Date(
        lastSuccess.completed_at.getTime() + intervalDays * 24 * 60 * 60 * 1000,
      );
    }

    const weights: Record<string, number> = {
      openlibrary: this.parseFloatConfig(configs[CONFIG_WEIGHTS[0]], 1),
    };
    // min_confidence_display=0 (show all) is a valid value, so use a
    // separate parser that accepts >= 0. With Open Library as the only
    // source, confidence is 0 or 1.
    const minConfidenceDisplay = this.parseNonNegativeInt(
      configs[CONFIG_MIN_CONF],
      1,
      3,
    );

    const runnerBusy = this.runner.isRunning();

    return plainToInstance(
      PopularityStatusDto,
      {
        status: runnerBusy ? 'running' : (latestRun?.status ?? 'idle'),
        stage: latestRun?.stage ?? null,
        triggered_by: latestRun?.triggered_by ?? null,
        started_at: latestRun?.started_at ?? null,
        completed_at: latestRun?.completed_at ?? null,
        audios_processed: latestRun?.audios_processed ?? null,
        audios_matched: latestRun?.audios_matched ?? null,
        source_match_counts: latestRun?.source_match_counts ?? null,
        error_message: latestRun?.error_message ?? null,
        batch_id: latestRun?.batch_id ?? null,
        interval_days: intervalDays,
        next_scheduled_at: nextScheduledAt,
        weights,
        min_confidence_display: minConfidenceDisplay,
      },
      { excludeExtraneousValues: true },
    );
  }

  async triggerManual(): Promise<AudioPopularityRun> {
    // Bust the status cache so the UI's next poll sees `pending`/`running`
    // immediately without waiting for the 15-second TTL.
    await this.cache.delete(CACHE_KEY_STATUS);
    return this.runner.start({ triggeredBy: 'manual' });
  }

  /**
   * Called by the runner service on successful run completion — flushes every
   * cached list permutation and the status cache so the fresh batch shows up
   * on the next request. Also called from the scheduler after cron-triggered
   * runs.
   */
  async invalidateReadCache(): Promise<void> {
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

  async streamCsv(write: (chunk: string) => void): Promise<void> {
    write('SKU,Title,Popularity Score,Confidence,Computed At\n');

    const chunkSize = 500;
    let offset = 0;
    while (true) {
      const rows = await this.scoresRepo.find({
        // See executeList: NULLS LAST, plus sku to keep OFFSET paging stable.
        order: {
          popularity_score: { direction: 'DESC', nulls: 'LAST' },
          sku: 'ASC',
        },
        skip: offset,
        take: chunkSize,
      });
      if (rows.length === 0) break;

      const skus = rows.map((r) => r.sku);
      const metas = await this.audioMetadataRepo.find({
        where: { sku: In(skus) },
        select: ['sku', 'title'],
      });
      const titleBySku = new Map(metas.map((m) => [m.sku, m.title ?? '']));

      for (const row of rows) {
        const title = titleBySku.get(row.sku) ?? '';
        write(
          `${row.sku},${this.csvEscape(title)},${row.popularity_score ?? ''},${row.confidence},${row.computed_at.toISOString()}\n`,
        );
      }
      offset += rows.length;
      if (rows.length < chunkSize) break;
    }
  }

  private csvEscape(v: string): string {
    // Neutralise spreadsheet formula injection before quoting. A title
    // beginning =, +, - or @ is executed as a formula when the export is
    // opened in Excel or Sheets; titles come from publisher metadata, so the
    // content is not ours to trust. Prefixing a single quote is the standard
    // mitigation and is invisible in the cell.
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  }

  private parsePositiveInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }

  private parseFloatConfig(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  private listCacheKey(query: ListPopularityDto): string {
    // Deterministic hash of the query so identical filter combos share a
    // single cache slot regardless of key ordering.
    const canonical = JSON.stringify({
      page: query.page ?? 1,
      per_page: query.per_page ?? 10,
      min_score: query.min_score ?? null,
      max_score: query.max_score ?? null,
      min_confidence: query.min_confidence ?? null,
      search: (query.search ?? '').trim().toLowerCase(),
    });
    const hash = createHash('sha1')
      .update(canonical)
      .digest('hex')
      .slice(0, 16);
    return `${CACHE_KEY_LIST_PREFIX}${hash}`;
  }

  private parseNonNegativeInt(
    raw: unknown,
    fallback: number,
    max: number,
  ): number {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : fallback;
  }
}
