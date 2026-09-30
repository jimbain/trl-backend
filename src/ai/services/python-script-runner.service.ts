import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';

export interface PythonRunOptions {
  /** File name inside `src/ai/scripts`, e.g. `backfill_ai_embedding.py`. */
  script: string;
  args?: string[];
  /** Hard ceiling. The child is SIGKILLed if it outlives this. */
  timeoutMs: number;
  /**
   * Graceful stop. Sent on shutdown so the script can commit its current chunk
   * before exiting; SIGKILL follows after `gracePeriodMs`.
   */
  gracePeriodMs?: number;
  /** Called for every non-terminal NDJSON line the script emits. */
  onProgress?: (message: Record<string, unknown>) => void;
}

const DEFAULT_GRACE_PERIOD_MS = 30_000;

/**
 * Spawns a python job from `src/ai/scripts` and speaks the NDJSON protocol the
 * AI scripts share:
 *
 *   {"...": progress}            → forwarded to `onProgress`
 *   {"done": true, ...}          → resolved as the return value
 *   {"error": "..."}             → thrown
 *
 * Extracted so the embedding backfill does not re-implement the spawn, line
 * parsing, timeout and shutdown handling that the recommendation runner already
 * worked out. Children are tracked so a Nest shutdown never leaves a zombie
 * python process holding a database connection (and, for the backfill, a
 * Postgres advisory lock).
 */
@Injectable()
export class PythonScriptRunnerService implements OnModuleDestroy {
  private readonly logger = new Logger(PythonScriptRunnerService.name);
  private readonly activeChildren = new Set<ChildProcessWithoutNullStreams>();

  onModuleDestroy() {
    for (const child of this.activeChildren) {
      if (!child.killed) {
        this.logger.warn('SIGTERM to python child due to module shutdown');
        child.kill('SIGTERM');
      }
    }
  }

  run(options: PythonRunOptions): Promise<Record<string, unknown> | null> {
    const {
      script,
      args = [],
      timeoutMs,
      gracePeriodMs = DEFAULT_GRACE_PERIOD_MS,
      onProgress,
    } = options;

    return new Promise((resolve, reject) => {
      const scriptPath = path.join(__dirname, '..', 'scripts', script);
      const pythonBin = process.env.PYTHON_BIN || 'python3';

      this.logger.log(`spawning ${script} ${args.join(' ')}`.trim());
      const child = spawn(pythonBin, ['-u', scriptPath, ...args], {
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.activeChildren.add(child);

      let finalPayload: Record<string, unknown> | null = null;
      let errorPayload: string | null = null;
      let killTimer: NodeJS.Timeout | null = null;

      const timeoutHandle = setTimeout(() => {
        this.logger.error(`${script} exceeded ${timeoutMs}ms — terminating`);
        errorPayload = errorPayload ?? `timeout after ${timeoutMs}ms`;
        // SIGTERM first: the scripts commit their in-flight work and release
        // their advisory lock on it. SIGKILL only if that is ignored.
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), gracePeriodMs);
      }, timeoutMs);

      const stdoutReader = readline.createInterface({ input: child.stdout });
      stdoutReader.on('line', (line) => {
        if (!line) return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(line);
        } catch {
          this.logger.debug(`[${script}] non-json: ${line}`);
          return;
        }
        if (typeof message.error === 'string') {
          errorPayload = message.error;
          return;
        }
        if (message.done === true) {
          finalPayload = message;
          return;
        }
        onProgress?.(message);
      });

      const stderrReader = readline.createInterface({ input: child.stderr });
      stderrReader.on('line', (line) =>
        this.logger.debug(`[${script}] ${line}`),
      );

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        if (killTimer) clearTimeout(killTimer);
        this.activeChildren.delete(child);
      };

      child.on('error', (err) => {
        cleanup();
        reject(err);
      });

      child.on('exit', (code, signal) => {
        cleanup();
        if (code === 0) {
          resolve(finalPayload);
          return;
        }
        reject(
          new Error(
            errorPayload
              ? `${script} failed: ${errorPayload}`
              : `${script} exited with code=${code} signal=${signal}`,
          ),
        );
      });
    });
  }
}
