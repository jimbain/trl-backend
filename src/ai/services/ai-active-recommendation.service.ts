import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { In, Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AiRecommendedActiveAudio } from '../entities/ai-recommended-active-audio.entity';
import { AiRecommendationRun } from '../entities/ai-recommendation-run.entity';
import {
  AiActiveRecommendationStatusDto,
  RecommendedActiveAudioDto,
  RecommendedActiveAudiosPageDto,
} from '../dto/recommended-active-audio.dto';
import { AiActiveRecommendationRunnerService } from './ai-active-recommendation-runner.service';

const CONFIG_KEY_INTERVAL = 'ai_recommendation_interval_days';
const DEFAULT_INTERVAL_DAYS = 30;

@Injectable()
export class AiActiveRecommendationService implements OnModuleInit {
  private readonly logger = new Logger(AiActiveRecommendationService.name);

  constructor(
    @InjectRepository(AiRecommendedActiveAudio)
    private readonly recoRepo: Repository<AiRecommendedActiveAudio>,
    @InjectRepository(AiRecommendationRun)
    private readonly runsRepo: Repository<AiRecommendationRun>,
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,
    private readonly runner: AiActiveRecommendationRunnerService,
    private readonly appConfigService: AppConfigService,
  ) {}

  async onModuleInit() {
    // Non-fatal ops warning: table is empty AND no success ever — nudge ops
    // to trigger the first regeneration. Wrapped in try/catch so a missing
    // migration (tables not yet created) never blocks backend startup.
    try {
      const [rows, lastSuccess] = await Promise.all([
        this.recoRepo.count(),
        this.runsRepo.findOne({
          where: { status: 'success' },
          order: { started_at: 'DESC' },
        }),
      ]);
      if (rows === 0 && !lastSuccess) {
        this.logger.warn(
          'ai_recommended_active_audios is empty and no successful run recorded. ' +
            'Trigger the first "Generate" from the Admin panel or wait for the cron.',
        );
      }
    } catch (err: any) {
      this.logger.warn(
        `AI active recommendation bootstrap check skipped: ${err?.message}. ` +
          'Have migrations been run?',
      );
    }
  }

  async listLatestBatch(
    page: number,
    limit: number,
  ): Promise<RecommendedActiveAudiosPageDto> {
    const latestRun = await this.runsRepo.findOne({
      where: { status: 'success' },
      order: { completed_at: 'DESC' },
    });

    if (!latestRun) {
      return plainToInstance(
        RecommendedActiveAudiosPageDto,
        {
          items: [],
          page,
          limit,
          total: 0,
          batch_id: null,
          computed_at: null,
        },
        { excludeExtraneousValues: true },
      );
    }

    const [rows, total] = await this.recoRepo.findAndCount({
      where: { batch_id: latestRun.batch_id },
      order: { rank: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const skus = rows.map((r) => r.sku);
    const audios = skus.length
      ? await this.audioRepo.find({
          where: { sku: In(skus) },
          relations: ['metadata'],
        })
      : [];
    const bySku = new Map(audios.map((a) => [a.sku, a]));

    const items = rows.map((row) => {
      const audio = bySku.get(row.sku);
      // Merge audio fields onto the recommendation so the DTO transforms have
      // everything (display_title, display_authors, metadata.cover_url, etc).
      return {
        ...(audio ?? {}),
        sku: row.sku,
        rank: row.rank,
        ai_similarity_score: row.ai_similarity_score,
        computed_at: row.computed_at,
      };
    });

    const itemDtos = plainToInstance(RecommendedActiveAudioDto, items, {
      excludeExtraneousValues: true,
    });

    return plainToInstance(
      RecommendedActiveAudiosPageDto,
      {
        items: itemDtos,
        page,
        limit,
        total,
        batch_id: latestRun.batch_id,
        computed_at: latestRun.completed_at,
      },
      { excludeExtraneousValues: true },
    );
  }

  async getStatus(): Promise<AiActiveRecommendationStatusDto> {
    const [latestRuns, lastSuccessRuns, configs] = await Promise.all([
      this.runsRepo.find({ order: { started_at: 'DESC' }, take: 1 }),
      this.runsRepo.find({
        where: { status: 'success' },
        order: { completed_at: 'DESC' },
        take: 1,
      }),
      this.appConfigService.getAppConfigs([CONFIG_KEY_INTERVAL]),
    ]);

    const latestRun = latestRuns[0] ?? null;
    const lastSuccess = lastSuccessRuns[0] ?? null;
    const intervalDays = this.parsePositiveInt(
      configs[CONFIG_KEY_INTERVAL],
      DEFAULT_INTERVAL_DAYS,
    );

    let nextScheduledAt: Date | null = null;
    if (lastSuccess?.completed_at) {
      nextScheduledAt = new Date(
        lastSuccess.completed_at.getTime() + intervalDays * 24 * 60 * 60 * 1000,
      );
    }

    // If a run is in-flight, reflect that in the status regardless of what the
    // last row says (there's a small window where inFlight is true but the row
    // is still 'pending').
    const runnerBusy = this.runner.isRunning();

    return plainToInstance(
      AiActiveRecommendationStatusDto,
      {
        status: runnerBusy ? 'running' : (latestRun?.status ?? 'idle'),
        stage: latestRun?.stage ?? null,
        triggered_by: latestRun?.triggered_by ?? null,
        started_at: latestRun?.started_at ?? null,
        completed_at: latestRun?.completed_at ?? null,
        rows_produced: latestRun?.rows_produced ?? null,
        error_message: latestRun?.error_message ?? null,
        batch_id: latestRun?.batch_id ?? null,
        interval_days: intervalDays,
        next_scheduled_at: nextScheduledAt,
      },
      { excludeExtraneousValues: true },
    );
  }

  triggerManual(): Promise<AiRecommendationRun> {
    return this.runner.start({ triggeredBy: 'manual' });
  }

  /**
   * Stream a batch as CSV. Called by the controller which pipes to res.
   * Uses the same columns the dev's manual CSV had (SKU, Book Title,
   * AI Similarity score) plus rank for parity with the UI table.
   */
  async streamCsv(
    write: (chunk: string) => void,
    batchId?: string,
  ): Promise<void> {
    const targetBatch = batchId ?? (await this.latestSuccessBatchId());
    if (!targetBatch) {
      throw new NotFoundException('No recommendation batch available.');
    }

    write('Rank,SKU,Book Title,AI Similarity Score\n');

    const chunkSize = 500;
    let offset = 0;
    while (true) {
      const rows = await this.recoRepo.find({
        where: { batch_id: targetBatch },
        order: { rank: 'ASC' },
        skip: offset,
        take: chunkSize,
      });
      if (rows.length === 0) break;

      const skus = rows.map((r) => r.sku);
      const audios = await this.audioRepo.find({
        where: { sku: In(skus) },
        select: ['sku', 'display_title'],
      });
      const titleBySku = new Map(
        audios.map((a) => [a.sku, a.display_title ?? '']),
      );

      for (const row of rows) {
        const title = titleBySku.get(row.sku) ?? '';
        write(
          `${row.rank},${row.sku},${this.csvEscape(title)},${row.ai_similarity_score}\n`,
        );
      }
      offset += rows.length;
      if (rows.length < chunkSize) break;
    }
  }

  private async latestSuccessBatchId(): Promise<string | null> {
    const latest = await this.runsRepo.findOne({
      where: { status: 'success' },
      order: { completed_at: 'DESC' },
    });
    return latest?.batch_id ?? null;
  }

  private csvEscape(v: string): string {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  }

  private parsePositiveInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }
}
