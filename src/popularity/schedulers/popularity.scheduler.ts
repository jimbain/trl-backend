import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AudioPopularityRun } from '../entities/audio-popularity-run.entity';
import { PopularityRunnerService } from '../services/popularity-runner.service';

const CONFIG_INTERVAL = 'popularity_interval_days';
const DEFAULT_INTERVAL_DAYS = 1;

@Injectable()
export class PopularityScheduler {
  private readonly logger = new Logger(PopularityScheduler.name);

  constructor(
    @InjectRepository(AudioPopularityRun)
    private readonly runsRepo: Repository<AudioPopularityRun>,
    private readonly runner: PopularityRunnerService,
    private readonly appConfigService: AppConfigService,
  ) {}

  // Daily at 04:00 UTC — shifted an hour later than Feature 1's cron so both
  // heavy jobs don't collide if they land on the same night.
  @Cron('0 4 * * *', { name: 'popularity_tick' })
  async handleTick() {
    if (this.runner.isRunning()) {
      this.logger.debug('runner busy, skipping this tick');
      return;
    }

    let intervalDays: number;
    let lastSuccess: AudioPopularityRun | null;
    try {
      const configs = await this.appConfigService.getAppConfigs([
        CONFIG_INTERVAL,
      ]);
      intervalDays = this.parsePositiveInt(
        configs[CONFIG_INTERVAL],
        DEFAULT_INTERVAL_DAYS,
      );
      lastSuccess = await this.runsRepo.findOne({
        where: { status: 'success' },
        order: { completed_at: 'DESC' },
      });
    } catch (err: any) {
      this.logger.warn(
        `popularity cron skipped — dependency check failed: ${err?.message}. ` +
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
        : 'no successful popularity run yet — starting first run',
    );

    try {
      await this.runner.start({ triggeredBy: 'cron' });
    } catch (err: any) {
      this.logger.warn(`popularity cron trigger skipped: ${err?.message}`);
    }
  }

  private parsePositiveInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }
}
