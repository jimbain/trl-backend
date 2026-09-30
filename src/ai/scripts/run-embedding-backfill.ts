/**
 * Manual `audios.ai_embedding` backfill.
 *
 * Invocation:
 *   npm run ai:embed-backfill
 *   npm run ai:embed-backfill -- --limit 200            # smoke test
 *   npm run ai:embed-backfill -- --max-runtime-min 0    # run to completion
 *   npm run ai:embed-backfill -- --all                  # rebuild every vector
 *
 * Same code path as the nightly cron — it boots a headless Nest context and
 * calls the same runner, so there is exactly one implementation of the job.
 * Safe to run while the API is up: the script takes a Postgres advisory lock,
 * so if the cron is mid-run this exits immediately instead of double-embedding.
 *
 * Exits 0 on success (including a clean stop at the time budget), 1 on failure.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { AiEmbeddingBackfillRunnerService } from 'src/ai/services/ai-embedding-backfill-runner.service';

function intArg(argv: string[], flag: string): number | undefined {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = Number(argv[i + 1]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `${flag} expects a non-negative integer, got: ${argv[i + 1]}`,
    );
  }
  return value;
}

async function main() {
  const logger = new Logger('ai-embed-backfill');
  const argv = process.argv.slice(2);

  const limit = intArg(argv, '--limit');
  const maxRuntimeMin = intArg(argv, '--max-runtime-min');
  const all = argv.includes('--all');

  // This run starts NOW and is independent of AI_EMBEDDING_BACKFILL_CRON — the
  // schedule only governs the nightly tick. Suppress the scheduler in this
  // process so booting AppModule does not also register a cron job inside a
  // one-shot CLI; it affects this process only, never the running API.
  process.env.AI_EMBEDDING_BACKFILL_ENABLED = 'false';

  logger.log('bootstrapping Nest context (no HTTP server)…');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Propagate Ctrl+C / SIGTERM through app.close() to the python child, which
  // commits the chunk it is holding before exiting. Without this, interrupting
  // a long backfill throws away up to a chunk of completed inference.
  app.enableShutdownHooks();

  const runner = app.get(AiEmbeddingBackfillRunnerService);

  try {
    const result = await runner.run({
      triggeredBy: 'cli',
      limit,
      maxRuntimeMin,
      all,
    });
    logger.log(
      `done — processed=${result.processed} updated=${result.updated} ` +
        `interrupted=${result.interrupted} reason="${result.reason}"`,
    );
    if (result.interrupted) {
      logger.warn(
        'Backfill stopped before finishing. Re-run to continue from where it left off.',
      );
    }
    await app.close();
    process.exit(0);
  } catch (err: any) {
    logger.error(`backfill failed: ${err?.message}`, err?.stack);
    await app.close();
    process.exit(1);
  }
}

void main();
