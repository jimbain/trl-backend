import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as readline from 'readline';

export interface RecommenderMatch {
  sku: string;
  score: number;
}

export interface RefreshResult {
  added: number;
  indexed: number;
}

interface PendingRequest {
  resolve: (response: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS = 15_000;
const REFRESH_TIMEOUT_MS = 10 * 60_000;
const RESTART_BACKOFF_MS = 2_000;
const MAX_RESTARTS = 5;

@Injectable()
export class PythonRecommenderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PythonRecommenderService.name);
  private child: ChildProcessWithoutNullStreams | null = null;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private ready!: Promise<void>;
  private readonly pending = new Map<string, PendingRequest>();
  private restartCount = 0;
  private shuttingDown = false;
  private startupError: Error | null = null;
  private isReady = false;
  private indexedCount = 0;

  onModuleInit() {
    this.spawnChild();
  }

  onModuleDestroy() {
    this.shuttingDown = true;
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
    }
  }

  async recommend(prompt: string, limit: number): Promise<RecommenderMatch[]> {
    this.assertReady();
    const response = await this.sendRequest<{ results?: RecommenderMatch[] }>(
      { prompt, limit },
      REQUEST_TIMEOUT_MS,
    );
    return response.results ?? [];
  }

  async refresh(): Promise<RefreshResult> {
    this.assertReady();
    const response = await this.sendRequest<RefreshResult>(
      { command: 'refresh' },
      REFRESH_TIMEOUT_MS,
    );
    const result: RefreshResult = {
      added: response.added ?? 0,
      indexed: response.indexed ?? 0,
    };
    this.indexedCount = result.indexed;
    return result;
  }

  getIndexedCount(): number {
    return this.indexedCount;
  }

  isWarm(): boolean {
    return this.isReady;
  }

  private assertReady() {
    if (this.startupError) {
      throw new ServiceUnavailableException(
        `recommender unavailable: ${this.startupError.message}`,
      );
    }
    if (!this.isReady) {
      throw new ServiceUnavailableException(
        'AI recommender is still warming up. Please retry in a moment.',
      );
    }
  }

  private sendRequest<T>(
    body: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<T> {
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('recommender timeout'));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (response) => resolve(response as T),
        reject,
        timer,
      });

      if (!this.child || !this.child.stdin.writable) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error('recommender process not available'));
        return;
      }
      this.child.stdin.write(JSON.stringify({ id, ...body }) + '\n');
    });
  }

  private spawnChild() {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'recommender.py');
    this.logger.log(`spawning python recommender: ${scriptPath}`);

    this.ready = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // Swallow unhandled rejection warnings; consumers check isReady/startupError.
    this.ready.catch(() => undefined);
    this.startupError = null;
    this.isReady = false;

    const pythonBin = process.env.PYTHON_BIN || 'python3';
    const child = spawn(pythonBin, ['-u', scriptPath], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;

    const stdoutReader = readline.createInterface({ input: child.stdout });
    stdoutReader.on('line', (line) => this.onStdoutLine(line));

    const stderrReader = readline.createInterface({ input: child.stderr });
    stderrReader.on('line', (line) => this.logger.debug(`[py] ${line}`));

    child.on('exit', (code, signal) => {
      this.logger.warn(
        `python recommender exited (code=${code}, signal=${signal})`,
      );
      this.isReady = false;
      this.rejectAllPending(new Error(`recommender exited (code=${code})`));
      if (this.startupError === null) {
        // Process died before emitting `ready`. Treat as startup failure.
        const err = new Error(`recommender failed to start (code=${code})`);
        this.startupError = err;
        this.readyReject(err);
      }
      if (this.shuttingDown) return;
      if (this.restartCount >= MAX_RESTARTS) {
        this.logger.error(
          `python recommender restart limit reached (${MAX_RESTARTS}); giving up`,
        );
        return;
      }
      this.restartCount += 1;
      setTimeout(() => this.spawnChild(), RESTART_BACKOFF_MS);
    });
  }

  private onStdoutLine(line: string) {
    if (!line) return;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      this.logger.warn(`unparseable line from recommender: ${line}`);
      return;
    }

    if (typeof msg.ready === 'boolean') {
      if (msg.ready) {
        this.logger.log(`recommender ready (indexed=${msg.indexed})`);
        this.restartCount = 0;
        this.isReady = true;
        this.indexedCount = typeof msg.indexed === 'number' ? msg.indexed : 0;
        this.readyResolve();
      } else {
        const error = new Error(String(msg.error ?? 'unknown startup error'));
        this.startupError = error;
        this.logger.error(`recommender startup failed: ${error.message}`);
        this.readyReject(error);
      }
      return;
    }

    const id = msg.id as string | undefined;
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    clearTimeout(pending.timer);

    if (typeof msg.error === 'string') {
      pending.reject(new Error(msg.error));
      return;
    }
    pending.resolve(msg);
  }

  private rejectAllPending(error: Error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}
