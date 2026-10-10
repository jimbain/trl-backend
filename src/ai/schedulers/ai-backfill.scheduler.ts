import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import {
  AiBackfillRunnerService,
  BACKFILL_JOBS,
  BackfillJob,
} from '../services/ai-backfill-runner.service';
import { PythonRecommenderService } from '../services/python-recommender.service';

const DEFAULT_TIMEZONE = 'UTC';
const DEFAULT_MAX_RUNTIME_MIN = 60;

/**
 * Per-job cron variable. Leaving one unset disables that job — one concept
 * instead of a separate enable flag per job.
 */
const CRON_ENV: Record<BackfillJob, string> = {
  'class-vector': 'AI_BACKFILL_CLASS_VECTOR_CRON',
  embedding: 'AI_BACKFILL_EMBEDDING_CRON',
  categories: 'AI_BACKFILL_CATEGORIES_CRON',
};

/** Only this job's column feeds the FAISS index, so only it triggers a refresh. */
const FAISS_BACKED_JOB: BackfillJob = 'embedding';

/**
 * Nightly top-up of the three AI columns on `audios`.
 *
 * This is NOT the bulk loader. The 1.4M-row initial fill is done out of band on
 * a GPU machine; this process exists for the handful of titles ingested each
 * day, which is seconds of work. It stays switched off until that bulk load is
 * finished — otherwise both would grind through the same backlog on a 4 vCPU
 * box, and the CPU side would lose.
 *
 *   AI_BACKFILL_ENABLED              master switch, default "false"
 *   AI_BACKFILL_CLASS_VECTOR_CRON    e.g. "0 2 * * *"   unset = job disabled
 *   AI_BACKFILL_EMBEDDING_CRON       e.g. "30 3 * * *"
 *   AI_BACKFILL_CATEGORIES_CRON      e.g. "0 5 * * *"   needs Ollama reachable
 *   AI_BACKFILL_TIMEZONE             IANA zone, default "UTC"
 *   AI_BACKFILL_MAX_RUNTIME_MIN      per-job budget, default 60
 *
 * Each job gets its own cron rather than running back to back, so the three
 * models never load at once and the nightly CPU spike is spread across the
 * window. They hold separate advisory locks, so an overrun of one does not
 * block another — it only defers it to the next night.
 *
 * Registered through SchedulerRegistry rather than @Cron() because the
 * schedules come from the environment, and a decorator argument has to be a
 * compile-time constant.
 */
@Injectable()
export class AiBackfillScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiBackfillScheduler.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly runner: AiBackfillRunnerService,
    private readonly recommender: PythonRecommenderService,
  ) {}

  onModuleInit() {
    // Defaults to OFF. A backfill that starts itself on a box that was never
    // meant to run one is a worse failure than one that never starts.
    if ((process.env.AI_BACKFILL_ENABLED ?? 'false') !== 'true') {
      this.logger.log(
        'AI backfill cron disabled (AI_BACKFILL_ENABLED is not "true"). ' +
          'Turn it on once the bulk GPU load has finished.',
      );
      return;
    }

    const timeZone = process.env.AI_BACKFILL_TIMEZONE || DEFAULT_TIMEZONE;
    const scheduled: string[] = [];

    for (const job of BACKFILL_JOBS) {
      const expression = process.env[CRON_ENV[job]]?.trim();
      if (!expression) {
        this.logger.log(`${job}: no ${CRON_ENV[job]} set — not scheduled`);
        continue;
      }

      let cronJob: CronJob;
      try {
        // Constructed eagerly so a malformed expression or zone is caught here,
        // at boot, rather than silently never firing.
        cronJob = new CronJob(
          expression,
          () => void this.handleTick(job),
          null,
          false,
          timeZone,
        );
      } catch (err: any) {
        this.logger.error(
          `${job}: invalid schedule (${CRON_ENV[job]}="${expression}" ` +
            `tz=${timeZone}): ${err?.message}. NOT scheduled.`,
        );
        continue;
      }

      this.schedulerRegistry.addCronJob(`ai_backfill_${job}`, cronJob);
      cronJob.start();
      scheduled.push(
        `${job} "${expression}" next ${cronJob.nextDate().toISO()}`,
      );
    }

    this.logger.log(
      scheduled.length
        ? `AI backfill scheduled (${timeZone}) — ${scheduled.join('; ')}`
        : 'AI backfill enabled but no job has a cron expression — nothing scheduled',
    );
  }

  private async handleTick(job: BackfillJob): Promise<void> {
    if (this.runner.isRunning()) {
      this.logger.warn(
        `${job}: another backfill is still running in this process — skipping ` +
          'this tick. Consider spacing the cron times further apart.',
      );
      return;
    }

    try {
      const result = await this.runner.run({
        triggeredBy: 'cron',
        job,
        maxRuntimeMin: this.parseNonNegativeInt(
          process.env.AI_BACKFILL_MAX_RUNTIME_MIN,
          DEFAULT_MAX_RUNTIME_MIN,
        ),
      });
      if (result.interrupted) {
        this.logger.warn(
          `${job}: stopped early (${result.reason}) after ${result.updated} ` +
            'rows — the remainder is picked up on the next run.',
        );
      }
    } catch (err: any) {
      // Never let a batch failure bubble into the scheduler — it would take the
      // job registration down with it. The next tick retries from the committed
      // work.
      this.logger.error(`${job}: nightly backfill failed: ${err?.message}`);
    }

    if (job === FAISS_BACKED_JOB) {
      await this.refreshFaissIndex();
    }
  }

  /**
   * Fold newly embedded rows into the live FAISS index.
   *
   * Only the `embedding` job needs this — recommender.py reads ai_embedding and
   * nothing else. class-vector is served straight from pgvector, which
   * maintains its own index on write, and categories is not searched by vector
   * at all.
   *
   * It belongs to the scheduler rather than the runner because the index lives
   * in the python child owned by *this* process. The CLI deliberately does not
   * load PythonRecommenderService — that is what was OOM-killing the box — so a
   * CLI backfill cannot refresh anything itself; this tick is what picks its
   * work up.
   */
  private async refreshFaissIndex(): Promise<void> {
    if (!this.recommender.isWarm()) {
      this.logger.warn(
        'FAISS recommender not ready — skipping index refresh. Newly embedded ' +
          'rows stay queued and are picked up by the next tick.',
      );
      return;
    }

    try {
      const { added, indexed } = await this.recommender.refresh();
      this.logger.log(
        added > 0
          ? `FAISS index refreshed: +${added} vectors, ${indexed} total`
          : `FAISS index already current (${indexed} vectors)`,
      );
    } catch (err: any) {
      this.logger.error(`FAISS index refresh failed: ${err?.message}`);
    }
  }

  private parseNonNegativeInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  }
}
