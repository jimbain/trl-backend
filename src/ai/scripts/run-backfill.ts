/**
 * Manual backfill of one `audios` AI column.
 *
 * Invocation — the job is required, because the three feed different features:
 *   npm run ai:backfill-class-vector        # AI_Class_Vector, Active-Based List
 *   npm run ai:backfill-embedding           # ai_embedding, prompt search
 *   npm run ai:backfill-categories          # ai_categories, needs Ollama
 *
 * All three accept the same flags after `--`:
 *   -- --limit 200            # smoke test
 *   -- --max-runtime-min 0    # run to completion
 *   -- --all                  # regenerate every row in the column
 *
 * This run starts NOW; the AI_BACKFILL_*_CRON vars only govern the nightly ticks.
 *
 * Deliberately boots a two-provider module rather than AppModule. Booting the
 * whole application here would also start PythonRecommenderService, whose
 * onModuleInit spawns the long-lived FAISS recommender — hundreds of thousands
 * of 768-dim vectors resident in memory. Running that next to the BGE model
 * this job loads is what the kernel OOM killer reaches for first on an 8 GB
 * box, and it would take the recommender down repeatedly while the backfill
 * ran. AiBackfillRunnerService needs only PythonScriptRunnerService, which has
 * no dependencies of its own, so none of TypeORM, Redis, Elasticsearch or FAISS
 * has to be loaded to run a batch job.
 *
 * Safe to run while the API is up: the python script takes a Postgres advisory
 * lock, so if the nightly cron is mid-run this exits immediately rather than
 * embedding anything twice.
 *
 * Exits 0 on success (including a clean stop at the time budget), 1 on failure.
 */
import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { config } from 'dotenv';
import {
  AiBackfillRunnerService,
  BACKFILL_JOBS,
  BackfillJob,
} from 'src/ai/services/ai-backfill-runner.service';
import { PythonScriptRunnerService } from 'src/ai/services/python-script-runner.service';

@Module({
  providers: [PythonScriptRunnerService, AiBackfillRunnerService],
})
class AiBackfillCliModule {}

function jobArg(argv: string[]): BackfillJob {
  const i = argv.indexOf('--job');
  const value = i === -1 ? undefined : argv[i + 1];
  if (!value || !BACKFILL_JOBS.includes(value as BackfillJob)) {
    throw new Error(
      `--job is required and must be one of: ${BACKFILL_JOBS.join(', ')}. ` +
        'They are not interchangeable — class-vector drives the Active-Based ' +
        'List pipeline, embedding drives prompt search, categories writes ' +
        'genre labels.',
    );
  }
  return value as BackfillJob;
}

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
  // AppModule's ConfigModule is not in play here, so load the env ourselves —
  // the python child inherits process.env and reads DB_* from it. Same file
  // list and same precedence (first file to define a key wins) as
  // ConfigModule.forRoot in app.module.ts, so the CLI cannot end up pointed at
  // a different database than the API.
  config({ path: ['.env', '.env.dev', '.env.stage', '.env.prod'] });

  const logger = new Logger('ai-backfill');
  const argv = process.argv.slice(2);

  const job = jobArg(argv);
  const limit = intArg(argv, '--limit');
  const maxRuntimeMin = intArg(argv, '--max-runtime-min');
  const all = argv.includes('--all');

  const app = await NestFactory.createApplicationContext(
    AiBackfillCliModule,
    // 'debug' included on purpose: the python child's stderr — resource
    // detection, model load, per-chunk counts — is logged at debug level. A
    // manual run that prints nothing for minutes is indistinguishable from a
    // hung one.
    { logger: ['error', 'warn', 'log', 'debug'] },
  );

  // Propagate Ctrl+C / SIGTERM through app.close() to the python child, which
  // commits the chunk it is holding before exiting. Without this, interrupting
  // a long backfill throws away up to a chunk of completed inference.
  app.enableShutdownHooks();

  const runner = app.get(AiBackfillRunnerService);

  try {
    const result = await runner.run({
      triggeredBy: 'cli',
      job,
      limit,
      maxRuntimeMin,
      all,
    });
    logger.log(
      `done — job=${job} processed=${result.processed} updated=${result.updated} ` +
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
