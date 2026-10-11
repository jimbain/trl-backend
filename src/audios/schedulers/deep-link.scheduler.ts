import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { DeepLinkGeneratorService } from '../services/deep-link-generator.service';

const JOB_NAME = 'deep_link_sweep';
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Nightly sweep that gives newly activated titles a Branch deep link.
 *
 *   DEEP_LINK_CRON             e.g. "0 1 * * *"   unset = not scheduled
 *   DEEP_LINK_TIMEZONE         IANA zone, default "UTC"
 *   DEEP_LINK_BATCH_SIZE       titles per batch, default 50
 *   DEEP_LINK_BATCH_DELAY_MS   pause between batches, default 2000
 *
 * Deep links were previously only ever created by running the CLI script by
 * hand, with nothing generating one when a title was activated. That is how
 * 26 active titles on production ended up with no link and stayed that way
 * until someone noticed.
 *
 * A nightly sweep rather than a hook on activation: it is self-healing, and
 * it also picks up titles that need a link for a company domain added after
 * they were activated — which an activation hook would miss. The cost of the
 * sweep is one indexed read per active title, because the generator writes
 * only when a link map actually changes.
 *
 * Registered through SchedulerRegistry rather than @Cron() because the
 * schedule comes from the environment and a decorator argument has to be a
 * compile-time constant. Same pattern as AiBackfillScheduler.
 *
 * Unset by default. A box that was never meant to talk to Branch should not
 * start doing so because it was deployed with a shared image.
 */
@Injectable()
export class DeepLinkScheduler implements OnModuleInit {
  private readonly logger = new Logger(DeepLinkScheduler.name);
  private running = false;

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly generator: DeepLinkGeneratorService,
  ) {}

  onModuleInit() {
    const expression = process.env.DEEP_LINK_CRON?.trim();
    if (!expression) {
      this.logger.log(
        'deep link sweep not scheduled (DEEP_LINK_CRON is unset)',
      );
      return;
    }

    const timeZone = process.env.DEEP_LINK_TIMEZONE || DEFAULT_TIMEZONE;

    let job: CronJob;
    try {
      // Constructed eagerly so a malformed expression or zone fails at boot,
      // visibly, rather than silently never firing.
      job = new CronJob(
        expression,
        () => void this.handleTick(),
        null,
        false,
        timeZone,
      );
    } catch (err: any) {
      this.logger.error(
        `invalid schedule (DEEP_LINK_CRON="${expression}" tz=${timeZone}): ` +
          `${err?.message}. NOT scheduled.`,
      );
      return;
    }

    this.schedulerRegistry.addCronJob(JOB_NAME, job);
    job.start();
    this.logger.log(
      `deep link sweep scheduled "${expression}" (${timeZone}) — ` +
        `next ${job.nextDate().toISO()}`,
    );
  }

  private async handleTick(): Promise<void> {
    // In-process guard on top of the generator's advisory lock: no reason to
    // open a connection just to be told another run owns it.
    if (this.running) {
      this.logger.warn('previous deep link sweep still running — skipping');
      return;
    }
    this.running = true;

    try {
      const result = await this.generator.run({
        batchSize: this.positiveInt(process.env.DEEP_LINK_BATCH_SIZE, 50),
        batchDelayMs: this.positiveInt(
          process.env.DEEP_LINK_BATCH_DELAY_MS,
          2000,
        ),
        onProgress: (m) => this.logger.log(m),
      });

      if (!result.ran) {
        this.logger.warn('deep link sweep skipped — lock held elsewhere');
        return;
      }

      this.logger.log(
        `deep link sweep done in ${Math.round(result.durationMs / 1000)}s: ` +
          `${result.written} written, ${result.unchanged} already current, ` +
          `${result.failed} failed, of ${result.found} active titles`,
      );

      // A handful of failures is normal (a title Branch rejects). Everything
      // failing means the API key or the service is the problem, and that
      // should not look the same as a quiet success.
      if (result.failed > 0 && result.written === 0 && result.processed > 0) {
        this.logger.error(
          `every deep link attempt failed (${result.failed}/${result.processed}). ` +
            'Check BRANCH_API_KEY and the Branch API.',
        );
      }
    } catch (err: any) {
      this.logger.error(
        `deep link sweep failed: ${err?.message ?? err}`,
        err?.stack,
      );
    } finally {
      this.running = false;
    }
  }

  private positiveInt(raw: string | undefined, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }
}
