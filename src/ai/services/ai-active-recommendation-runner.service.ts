import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import * as readline from 'readline';
import { In, Repository } from 'typeorm';
import {
  AiRecommendationRun,
  AiRecommendationRunStatus,
  AiRecommendationRunTrigger,
} from '../entities/ai-recommendation-run.entity';
import { AiRecommendedActiveAudio } from '../entities/ai-recommended-active-audio.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AudioElasticsearchSyncService } from 'src/audios/audio-elasticsearch-sync.service';

const RANK_SCRIPT = 'active_recommendations.py';

const CONFIG_KEY_TOP_N = 'ai_recommendation_top_n';
const CONFIG_KEY_TOP_K = 'ai_recommendation_top_k_per_active';

const DEFAULT_TOP_N = 1000;
const DEFAULT_TOP_K = 50;

// Hard ceiling to protect against a hung Python job. Now that embedding has
// moved out, this pipeline only ranks — minutes of work over ~1,900 active
// titles — so an hour is generous and still frees the mutex if something
// deadlocks. It is deliberately NOT a budget the job is expected to use.
const SCRIPT_TIMEOUT_MS = 60 * 60 * 1000;

interface RunOptions {
  triggeredBy: AiRecommendationRunTrigger;
}

@Injectable()
export class AiActiveRecommendationRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(
    AiActiveRecommendationRunnerService.name,
  );
  private inFlight: Promise<AiRecommendationRun> | null = null;
  private activeChild: ChildProcessWithoutNullStreams | null = null;

  constructor(
    @InjectRepository(AiRecommendationRun)
    private readonly runsRepo: Repository<AiRecommendationRun>,
    @InjectRepository(AiRecommendedActiveAudio)
    private readonly recoRepo: Repository<AiRecommendedActiveAudio>,
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,
    private readonly appConfigService: AppConfigService,
    private readonly audioEsSync: AudioElasticsearchSyncService,
  ) {}

  onModuleDestroy() {
    // Ensure no zombie Python process survives a Nest shutdown / container
    // recycle. The `ai_recommendation_runs` row for the current batch will be
    // left as 'running' — on next boot the scheduler ignores it (only success
    // gates the cron), and the admin can trigger a fresh Generate.
    if (this.activeChild && !this.activeChild.killed) {
      this.logger.warn('killing active Python child due to module shutdown');
      this.activeChild.kill('SIGTERM');
    }
  }

  isRunning(): boolean {
    return this.inFlight !== null;
  }

  async start(options: RunOptions): Promise<AiRecommendationRun> {
    if (this.inFlight) {
      throw new ConflictException(
        'An AI recommendation regeneration is already in progress.',
      );
    }

    const run = this.runsRepo.create({
      batch_id: crypto.randomUUID(),
      status: 'pending' satisfies AiRecommendationRunStatus,
      stage: null,
      triggered_by: options.triggeredBy,
      completed_at: null,
      rows_produced: null,
      error_message: null,
    });
    await this.runsRepo.save(run);

    this.inFlight = this.execute(run).finally(() => {
      this.inFlight = null;
    });

    // Fire-and-forget: return the pending run so the caller (HTTP request or
    // scheduler tick) can respond immediately. Errors are captured in the run
    // row so the frontend polling loop can surface them.
    this.inFlight.catch((err) => {
      this.logger.error(`run ${run.id} failed: ${err.message}`, err.stack);
    });

    return run;
  }

  private async execute(
    run: AiRecommendationRun,
  ): Promise<AiRecommendationRun> {
    try {
      // Ranking only. Embedding used to be stage one here, and it is why this
      // pipeline failed 24 nights in a row: filling AI_Class_Vector is ~11 hours
      // of CPU against a 3-hour SCRIPT_TIMEOUT_MS, and the script it called
      // committed once at the very end — so every run was killed before it
      // committed and rolled back a full night of inference.
      //
      // Vectors are now owned by AiEmbeddingBackfillScheduler, which fills them
      // in resumable chunks on its own budget. This pipeline ranks whatever
      // vectors exist when it runs, which is also what makes "Generate" usable:
      // an admin gets a fresh ranking in minutes instead of waiting on a job
      // that cannot finish inside any reasonable request.
      await this.updateRun(run, {
        status: 'running',
        stage: 'ranking',
      });

      const configs = await this.appConfigService.getAppConfigs([
        CONFIG_KEY_TOP_N,
        CONFIG_KEY_TOP_K,
      ]);
      const topN = this.parsePositiveInt(
        configs[CONFIG_KEY_TOP_N],
        DEFAULT_TOP_N,
      );
      const topK = this.parsePositiveInt(
        configs[CONFIG_KEY_TOP_K],
        DEFAULT_TOP_K,
      );

      const finalPayload = await this.runScript(
        RANK_SCRIPT,
        [
          '--batch-id',
          run.batch_id,
          '--top-n',
          String(topN),
          '--top-k-per-active',
          String(topK),
        ],
        run,
      );

      const rows =
        typeof finalPayload?.rows === 'number' ? finalPayload.rows : null;

      await this.updateRun(run, {
        status: 'success',
        stage: 'done',
        completed_at: new Date(),
        rows_produced: rows,
      });
      this.syncBatchToElasticsearch(run.batch_id);
      return run;
    } catch (err: any) {
      await this.updateRun(run, {
        status: 'failed',
        completed_at: new Date(),
        error_message: err?.message ?? String(err),
      });
      throw err;
    }
  }

  private updateRun(
    run: AiRecommendationRun,
    patch: Partial<AiRecommendationRun>,
  ): Promise<AiRecommendationRun> {
    Object.assign(run, patch);
    return this.runsRepo.save(run);
  }

  private syncBatchToElasticsearch(batchId: string): void {
    const run = async () => {
      const rows = await this.recoRepo.find({ where: { batch_id: batchId } });
      if (rows.length === 0) return;
      const skus = rows.map((r) => r.sku);
      const audioRows = await this.audioRepo.find({
        where: { sku: In(skus) },
        select: ['id'],
      });
      const ids = audioRows.map((a) => a.id);
      const CHUNK = 10;
      for (let i = 0; i < ids.length; i += CHUNK) {
        await Promise.allSettled(
          ids
            .slice(i, i + CHUNK)
            .map((id) => this.audioEsSync.syncAudioById(id)),
        );
      }
      this.logger.log(
        `ES: synced ${ids.length} audio docs after AI recommendation run`,
      );
    };
    run().catch((err: any) =>
      this.logger.warn(
        `ES sync after AI recommendation failed: ${err?.message}`,
      ),
    );
  }

  private parsePositiveInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }

  /**
   * Spawn a python script, stream its NDJSON stdout, collect the final
   * `{done: true, ...}` payload, and forward `{error: "..."}` as a thrown
   * exception. Stderr is logged at debug level. Never resolves until the
   * process exits — this is a batch job, not a request/response worker.
   */
  private runScript(
    scriptName: string,
    args: string[],
    run: AiRecommendationRun,
  ): Promise<Record<string, unknown> | null> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
      const pythonBin = process.env.PYTHON_BIN || 'python3';

      this.logger.log(`spawning ${scriptName} for run ${run.id}`);
      const child: ChildProcessWithoutNullStreams = spawn(
        pythonBin,
        ['-u', scriptPath, ...args],
        { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      this.activeChild = child;

      let finalPayload: Record<string, unknown> | null = null;
      let errorPayload: string | null = null;

      const timeoutHandle = setTimeout(() => {
        this.logger.error(
          `${scriptName} exceeded ${SCRIPT_TIMEOUT_MS}ms — killing`,
        );
        errorPayload = errorPayload ?? `timeout after ${SCRIPT_TIMEOUT_MS}ms`;
        child.kill('SIGKILL');
      }, SCRIPT_TIMEOUT_MS);

      const stdoutReader = readline.createInterface({ input: child.stdout });
      stdoutReader.on('line', (line) => {
        if (!line) return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line);
        } catch {
          this.logger.debug(`[${scriptName}] non-json: ${line}`);
          return;
        }
        if (typeof msg.error === 'string') {
          errorPayload = msg.error;
          return;
        }
        if (msg.done === true) {
          finalPayload = msg;
          return;
        }
        // Progress line — surface at debug; UI polls the runs table for stage.
        this.logger.debug(`[${scriptName}] ${line}`);
      });

      const stderrReader = readline.createInterface({ input: child.stderr });
      stderrReader.on('line', (line) =>
        this.logger.debug(`[${scriptName}] ${line}`),
      );

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        if (this.activeChild === child) this.activeChild = null;
      };

      child.on('error', (err) => {
        cleanup();
        reject(err);
      });
      child.on('exit', (code, signal) => {
        cleanup();
        if (code === 0) {
          resolve(finalPayload);
        } else {
          reject(
            new Error(
              errorPayload
                ? `${scriptName} failed: ${errorPayload}`
                : `${scriptName} exited with code=${code} signal=${signal}`,
            ),
          );
        }
      });
    });
  }
}
