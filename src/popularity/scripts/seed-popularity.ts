/**
 * First-run bootstrap for the popularity pipeline.
 *
 * Invocation:  `npm run popularity:seed`
 *
 * What it does:
 *   1. Boots a headless Nest application context (no HTTP server).
 *   2. Grabs PopularityRunnerService from the DI container.
 *   3. Fires a run tagged with triggered_by='manual' and BLOCKS until the
 *      pipeline reaches success or failed. Prints periodic heartbeat lines
 *      so you know it's alive.
 *   4. Exits 0 on success, 1 on failure.
 *
 * Why this exists:
 *   - After the migration runs, the popularity tables are empty. The daily
 *     cron doesn't fire until 04:00 UTC. Rather than wait or click through
 *     the admin UI, ops runs this once to populate the first batch.
 *   - Idempotent — safe to re-run. Each invocation appends a new batch to
 *     audio_popularity_history and upserts audio_popularity_scores.
 *
 * Runtime: 5–15 minutes for ~2500 active audios on a cold cache, ~30 s
 * on a warm cache.
 */
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from 'src/app.module';
import { PopularityRunnerService } from 'src/popularity/services/popularity-runner.service';

const HEARTBEAT_MS = 30_000;

async function main() {
  const logger = new Logger('popularity-seed');
  logger.log('bootstrapping Nest context (no HTTP server)…');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const runner = app.get(PopularityRunnerService);

  logger.log('starting popularity run (triggered_by=manual)…');
  const startedAt = Date.now();

  // Heartbeat while we wait — lets the operator know the process is alive.
  const heartbeat = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    logger.log(`…still running (${elapsed}s elapsed)`);
  }, HEARTBEAT_MS);

  let exitCode = 0;
  try {
    const run = await runner.startAndWait({ triggeredBy: 'manual' });
    clearInterval(heartbeat);

    const summary = [
      '',
      '📊 Popularity seed result:',
      `   Status:           ${run.status}`,
      `   Batch ID:         ${run.batch_id}`,
      `   Audios processed: ${run.audios_processed ?? 'n/a'}`,
      `   Audios matched:   ${run.audios_matched ?? 'n/a'}`,
      `   Started at:       ${run.started_at?.toISOString?.() ?? run.started_at}`,
      `   Completed at:     ${run.completed_at?.toISOString?.() ?? run.completed_at}`,
    ];
    summary.forEach((line) => (line ? logger.log(line) : console.log()));

    if (run.status === 'partial') {
      // Completed and committed a batch, so the seed itself succeeded — but a
      // configured source matched nothing at all, which is a broken fetcher,
      // not an unlucky night. Exit 0 so a deploy isn't blocked; shout so it
      // doesn't go unnoticed for 37 nights the way Google Books did.
      const counts = JSON.stringify(run.source_match_counts ?? {});
      logger.warn(
        `⚠️  popularity seed completed, but a source matched ZERO audios: ${counts}. ` +
          'Check that fetcher and its upstream API before trusting these scores.',
      );
    } else if (run.status !== 'success') {
      logger.error(
        `run did not succeed: ${run.error_message ?? '(no message)'}`,
      );
      exitCode = 1;
    } else {
      logger.log('✅ popularity seed completed successfully.');
    }
  } catch (err: any) {
    clearInterval(heartbeat);
    logger.error(`seed threw: ${err?.message ?? String(err)}`);
    exitCode = 1;
  }

  await app.close();
  process.exit(exitCode);
}

main().catch((err) => {
  // Last-resort catch — should never reach here since main() handles its own.
  console.error('unexpected top-level failure:', err);
  process.exit(1);
});
