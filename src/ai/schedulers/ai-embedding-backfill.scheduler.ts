import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import {
  AiEmbeddingBackfillRunnerService,
  EmbeddingColumn,
} from '../services/ai-embedding-backfill-runner.service';
import { PythonRecommenderService } from '../services/python-recommender.service';

const JOB_NAME = 'ai_embedding_backfill';

/** Matches backfill_embeddings.py's own default (AI_EMBED_MAX_RUNTIME_MIN). */
const DEFAULT_BUDGET_MIN = 300;

/**
 * Both vector columns, filled in one nightly pass on a shared budget. Order
 * matters: see handleTick.
 */
const COLUMN_ORDER: EmbeddingColumn[] = ['AI_Class_Vector', 'ai_embedding'];

/** 02:00 — before the 03:00 recommendation tick, so fresh vectors are ready for it. */
const DEFAULT_CRON = '0 2 * * *';
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Nightly backfill of both `audios` vector columns, then a FAISS index refresh.
 *
 * AI_Class_Vector is filled first — it drives the Active-Based List pipeline,
 * which cannot run at all without vectors — then ai_embedding, which backs
 * prompt search and degrades gracefully when it lags. Both share one time
 * budget so the pair cannot overrun the nightly window.
 *
 * Embedding and the FAISS refresh belong together: embedding a row only makes
 * it *searchable*
 * once the vector is folded into the FAISS index the "By Prompt" recommender
 * queries. Leaving that to the admin's "Refresh AI Index" button meant the
 * "with embeddings" count climbed nightly while "indexed in FAISS" never moved.
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
 * a NULL vector. The first run after go-live is the long one; it is
 * bounded by AI_EMBED_MAX_RUNTIME_MIN and resumes on subsequent nights, so no
 * single invocation has to carry the whole catalogue.
 */
@Injectable()
export class AiEmbeddingBackfillScheduler implements OnModuleInit {
  private readonly logger = new Logger(AiEmbeddingBackfillScheduler.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly runner: AiEmbeddingBackfillRunnerService,
    private readonly recommender: PythonRecommenderService,
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
          'Nightly embedding backfill is NOT scheduled — fix the env vars and redeploy.',
      );
      return;
    }

    this.schedulerRegistry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(
      `scheduled embedding backfill: "${expression}" (${timeZone}), ` +
        `next run ${job.nextDate().toISO()}`,
    );
  }

  private async handleTick(): Promise<void> {
    if (this.runner.isRunning()) {
      this.logger.debug('previous backfill still running — skipping this tick');
      return;
    }

    const budgetMin = this.parseNonNegativeInt(
      process.env.AI_EMBED_MAX_RUNTIME_MIN,
      DEFAULT_BUDGET_MIN,
    );
    const startedAt = Date.now();

    // AI_Class_Vector first: it is the column the Active-Based List pipeline
    // reads, and the one that fell six weeks behind. Prompt search degrades
    // gracefully when ai_embedding lags; the recommendation pipeline does not
    // run at all without vectors.
    for (const column of COLUMN_ORDER) {
      // 0 is the script's contract for "unlimited", so an unlimited budget has
      // to skip the spent-check entirely rather than route through it.
      let remainingMin = 0;
      if (budgetMin > 0) {
        remainingMin = this.remainingBudget(budgetMin, startedAt);
        if (remainingMin === 0) {
          this.logger.warn(
            `budget of ${budgetMin} min spent before reaching ${column} — ` +
              'it is picked up on the next run.',
          );
          break;
        }
      }

      try {
        const result = await this.runner.run({
          triggeredBy: 'cron',
          column,
          maxRuntimeMin: remainingMin,
        });
        if (result.interrupted) {
          this.logger.warn(
            `${column} stopped early (${result.reason}) after ${result.updated} ` +
              'rows — the remainder is picked up on the next run.',
          );
        }
      } catch (err: any) {
        // Never let a batch failure bubble into the scheduler — it would take
        // the job registration down with it, and one column failing should not
        // stop the other. The next tick retries from the committed work.
        this.logger.error(`nightly ${column} backfill failed: ${err?.message}`);
      }
    }

    // Always refresh, even when the backfill above did nothing. A long manual
    // `npm run ai:embed-backfill` holds the advisory lock, so this tick exits
    // having embedded nothing — but that CLI process has been writing rows all
    // day and they still need indexing.
    await this.refreshFaissIndex();
  }

  /**
   * Fold newly embedded rows into the live FAISS index.
   *
   * This belongs to the scheduler rather than the runner because the index
   * lives in the python child owned by *this* process. The CLI entry point
   * deliberately does not load PythonRecommenderService — that is what was
   * OOM-killing the box — so a CLI backfill cannot refresh anything itself;
   * this nightly tick is what picks its work up.
   *
   * Once a night rather than continuously, on purpose: recommender.py reads
   * stdin serially, so an in-flight refresh blocks prompt recommendations, and
   * any refresh that adds rows rewrites the whole index file to disk — a cost
   * set by index size, not by how many rows arrived. A refresh that finds
   * nothing new is one cheap query and no write at all.
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

  /**
   * Whole minutes left of the tick's shared budget, or 0 when it is spent.
   * Only called for a finite budget — the caller handles "unlimited" (0) before
   * reaching here, because 0 is also the script's value for "no limit" and the
   * two meanings must not be allowed to collide.
   */
  private remainingBudget(budgetMin: number, startedAt: number): number {
    const spentMin = (Date.now() - startedAt) / 60_000;
    const left = Math.floor(budgetMin - spentMin);
    return left > 0 ? left : 0;
  }

  private parseNonNegativeInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  }
}
