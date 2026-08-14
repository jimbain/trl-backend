import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiRecommendationRun } from '../entities/ai-recommendation-run.entity';
import { AiActiveRecommendationRunnerService } from '../services/ai-active-recommendation-runner.service';
import { AppConfigService } from 'src/app-config/app-config.service';

const CONFIG_KEY_INTERVAL = 'ai_recommendation_interval_days';
const DEFAULT_INTERVAL_DAYS = 30;

@Injectable()
export class AiActiveRecommendationScheduler {
  private readonly logger = new Logger(AiActiveRecommendationScheduler.name);

  constructor(
    @InjectRepository(AiRecommendationRun)
    private readonly runsRepo: Repository<AiRecommendationRun>,
    private readonly runner: AiActiveRecommendationRunnerService,
    private readonly appConfigService: AppConfigService,
  ) {}

  // Daily at 03:00 UTC — cheap tick that decides whether the interval has
  // elapsed since the last successful run and only then invokes the runner.
  // Keeps the admin-tunable interval effective without extra scheduler
  // plumbing.
  @Cron('0 3 * * *', { name: 'ai_active_recommendation_tick' })
  async handleTick() {
    if (this.runner.isRunning()) {
      this.logger.debug('runner busy, skipping this tick');
      return;
    }

    let intervalDays: number;
    let lastSuccess: AiRecommendationRun | null;
    try {
      const configs = await this.appConfigService.getAppConfigs([
        CONFIG_KEY_INTERVAL,
      ]);
      intervalDays = this.parsePositiveInt(
        configs[CONFIG_KEY_INTERVAL],
        DEFAULT_INTERVAL_DAYS,
      );
      lastSuccess = await this.runsRepo.findOne({
        where: { status: 'success' },
        order: { completed_at: 'DESC' },
      });
    } catch (err: any) {
      this.logger.warn(
        `cron tick skipped — dependency check failed: ${err?.message}. ` +
          'Have migrations been run?',
      );
      return;
    }

    if (lastSuccess?.completed_at) {
      const elapsedMs = Date.now() - lastSuccess.completed_at.getTime();
      const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
      if (elapsedMs < intervalMs) {
        this.logger.debug(
          `interval not yet elapsed (${Math.floor(elapsedMs / 3_600_000)}h of ${intervalDays * 24}h)`,
        );
        return;
      }
    }

    this.logger.log(
      lastSuccess
        ? `interval elapsed since ${lastSuccess.completed_at?.toISOString()} — starting run`
        : 'no successful run yet — starting first run',
    );

    try {
      await this.runner.start({ triggeredBy: 'cron' });
    } catch (err: any) {
      // A ConflictException here just means someone hit "Generate" between
      // isRunning() and start(). That's fine — swallow and wait for tomorrow.
      this.logger.warn(`cron trigger skipped: ${err?.message}`);
    }
  }

  private parsePositiveInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }
}
