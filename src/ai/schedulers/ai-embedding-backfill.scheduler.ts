import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AiEmbeddingBackfillRunnerService } from '../services/ai-embedding-backfill-runner.service';

const JOB_NAME = 'ai_embedding_backfill';

/** 02:00 — before the 03:00 recommendation tick, so fresh vectors are ready for it. */
const DEFAULT_CRON = '0 2 * * *';
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Nightly `audios.ai_embedding` backfill.
 *
 * Registered through SchedulerRegistry rather than the `@Cron()` decorator
 * because the schedule comes from the environment, and a decorator argument has
 * to be a compile-time constant. Configuration:
 *
 *   AI_EMBEDDING_BACKFILL_ENABLED    "false" disables it entirely (default on)
 *   AI_EMBEDDING_BACKFILL_CRON       cron expression   (default "0 2 * * *")
 *   AI_EMBEDDING_BACKFILL_TIMEZONE   IANA zone         (default "UTC")
 *
 * Steady state this is a few seconds of work — only newly ingested audios have
 * a NULL ai_embedding. The first run after go-live is the long one; it is
 * bounded by AI_EMBED_MAX_RUNTIME_MIN and resumes on subsequent nights, so no
 * single invocation has to carry the whole catalogue.
 */
@Injectable()
export class AiEmbeddingBackfillScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiEmbeddingBackfillScheduler.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly runner: AiEmbeddingBackfillRunnerService,
  ) {}

  onModuleInit() {
    if ((process.env.AI_EMBEDDING_BACKFILL_ENABLED ?? 'true') === 'false') {
      this.logger.log('disabled via AI_EMBEDDING_BACKFILL_ENABLED=false');
      return;
    }

    const expression = process.env.AI_EMBEDDING_BACKFILL_CRON || DEFAULT_CRON;
    const timeZone =
      process.env.AI_EMBEDDING_BACKFILL_TIMEZONE || DEFAULT_TIMEZONE;

    let job: CronJob;
    try {
      // Constructed eagerly so a malformed expression or zone is caught here,
      // at boot, instead of silently never firing.
      job = new CronJob(
        expression,
        () => void this.handleTick(),
        null,
        false,
        timeZone,
      );
    } catch (err: any) {
      this.logger.error(
        `invalid schedule (cron=${expression!} tz=${timeZone}): ${err?.message}. ` +
          'Nightly ai_embedding backfill is NOT scheduled — fix the env vars and redeploy.',
      );
      return;
    }

    this.schedulerRegistry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(
      `scheduled ai_embedding backfill: "${expression}" (${timeZone}), ` +
        `next run ${job.nextDate().toISO()}`,
    );
  }

  private async handleTick(): Promise<void> {
    if (this.runner.isRunning()) {
      this.logger.debug('previous backfill still running — skipping this tick');
      return;
    }

    try {
      const result = await this.runner.run({ triggeredBy: 'cron' });
      if (result.interrupted) {
        this.logger.warn(
          `backfill stopped early (${result.reason}) after ${result.updated} rows — ` +
            'the remainder is picked up on the next run.',
        );
      }
    } catch (err: any) {
      // Never let a batch failure bubble into the scheduler — it would take the
      // job registration down with it. The next tick retries from wherever the
      // committed work left off.
      this.logger.error(
        `nightly ai_embedding backfill failed: ${err?.message}`,
      );
    }
  }
}
