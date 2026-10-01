import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  PythonScriptRunnerService,
  PythonRunOptions,
} from './python-script-runner.service';

const SCRIPT = 'backfill_embeddings.py';

/** Matches the script's own default budget (AI_EMBED_MAX_RUNTIME_MIN). */
const DEFAULT_MAX_RUNTIME_MIN = 300;

/**
 * Head-room over the script's own time budget. The script stops itself at the
 * budget and commits; this ceiling only fires if it has genuinely wedged.
 */
const TIMEOUT_GRACE_MIN = 30;

export type EmbeddingBackfillTrigger = 'cron' | 'manual' | 'cli';

/**
 * The two pgvector columns on `audios`. They are not interchangeable:
 *
 *   AI_Class_Vector  drives the Active-Based List pipeline
 *   ai_embedding     drives prompt search ("recommend from a description")
 *
 * Same embedding model and same source text, different consumers — so one
 * engine fills both, but a caller always says which.
 */
export type EmbeddingColumn = 'AI_Class_Vector' | 'ai_embedding';

export interface EmbeddingBackfillOptions {
  triggeredBy: EmbeddingBackfillTrigger;
  column: EmbeddingColumn;
  /** Stop after N rows. 0/undefined = no limit. */
  limit?: number;
  /** Override the script's time budget, in minutes. 0 = unlimited. */
  maxRuntimeMin?: number;
  /** Re-embed every row rather than only the NULL ones. */
  all?: boolean;
}

export interface EmbeddingBackfillResult {
  processed: number;
  updated: number;
  interrupted: boolean;
  reason: string;
}

/**
 * Orchestrates `backfill_embeddings.py` for either vector column.
 *
 * Deliberately thin: it owns no run table and no progress state of its own.
 * The script is the single source of truth for what still needs embedding
 * (`<column> IS NULL`), and a Postgres advisory lock — not this class — is what
 * actually guarantees single-flight, because that has to hold across replicas
 * and across the CLI entry point too. The script keys that lock on the column,
 * so the two columns never block each other.
 *
 * The in-process guard below is narrower on purpose: it serialises this
 * process's own runs regardless of column, because two concurrent backfills
 * would each load a BGE model and contend for the same few cores.
 */
@Injectable()
export class AiEmbeddingBackfillRunnerService {
  private readonly logger = new Logger(AiEmbeddingBackfillRunnerService.name);
  private inFlight: Promise<EmbeddingBackfillResult> | null = null;

  constructor(private readonly pythonRunner: PythonScriptRunnerService) {}

  isRunning(): boolean {
    return this.inFlight !== null;
  }

  /** Resolves only when the backfill finishes — this is a batch job, not a request. */
  async run(
    options: EmbeddingBackfillOptions,
  ): Promise<EmbeddingBackfillResult> {
    if (this.inFlight) {
      throw new ConflictException(
        'An embedding backfill is already in progress in this process.',
      );
    }

    this.inFlight = this.execute(options).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async execute(
    options: EmbeddingBackfillOptions,
  ): Promise<EmbeddingBackfillResult> {
    const maxRuntimeMin =
      options.maxRuntimeMin ??
      this.parseNonNegativeInt(
        process.env.AI_EMBED_MAX_RUNTIME_MIN,
        DEFAULT_MAX_RUNTIME_MIN,
      );

    const args = [
      '--column',
      options.column,
      '--max-runtime-min',
      String(maxRuntimeMin),
    ];
    if (options.limit && options.limit > 0) {
      args.push('--limit', String(options.limit));
    }
    if (options.all) args.push('--all');

    // 0 means "run until the work is done", so there is no meaningful budget to
    // derive a timeout from. Fall back to a day — long enough for a first
    // full-catalogue backfill, short enough to still catch a wedged process.
    const timeoutMs =
      maxRuntimeMin > 0
        ? (maxRuntimeMin + TIMEOUT_GRACE_MIN) * 60_000
        : 24 * 60 * 60_000;

    const runOptions: PythonRunOptions = {
      script: SCRIPT,
      args,
      timeoutMs,
      onProgress: (message) => {
        if (message.stage !== 'embedding') return;
        this.logger.log(
          `${options.column}: ${message.processed} done, ${message.remaining} left ` +
            `(${message.rate_per_min}/min, eta ${message.eta_min ?? '?'} min)`,
        );
      },
    };

    this.logger.log(
      `starting ${options.column} backfill (trigger=${options.triggeredBy}, ` +
        `budget=${maxRuntimeMin || 'unlimited'} min)`,
    );

    const payload = await this.pythonRunner.run(runOptions);
    const result: EmbeddingBackfillResult = {
      processed: this.parseNonNegativeInt(payload?.processed, 0),
      updated: this.parseNonNegativeInt(payload?.updated, 0),
      interrupted: payload?.interrupted === true,
      reason:
        typeof payload?.reason === 'string' ? payload.reason : 'completed',
    };

    this.logger.log(
      `${options.column} backfill finished — ${result.updated} rows updated ` +
        `(${result.reason})`,
    );
    return result;
  }

  private parseNonNegativeInt(raw: unknown, fallback: number): number {
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : fallback;
  }
}
