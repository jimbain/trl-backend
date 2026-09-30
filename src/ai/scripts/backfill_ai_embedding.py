"""Resumable backfill of `audios.ai_embedding`.

Adapted from the AI dev's ai/AIEmbedding.py, which established the recipe:
BAAI/bge-base-en-v1.5 over `display_title + ' ' + display_description`, L2
normalised. This version removes the hardcoded credentials and the CSV
round-trip, and turns a single long-running script into a job that can be
stopped and resumed at any point.

Invocation:
    python3 backfill_ai_embedding.py [--limit N] [--max-runtime-min N]
                                     [--batch-size N] [--chunk-size N]
                                     [--threads N] [--all]

Stdout — one JSON object per line (parsed by the Node runner service):
    {"stage":"model_loading","model":"...","to_embed":N}  (before the model loads)
    {"stage":"embedding","processed":N,"updated":M,"remaining":R,
     "rate_per_min":X,"eta_min":Y}            (progress, one per chunk)
    {"done":true,"processed":N,"updated":M,"interrupted":bool,"reason":"..."}
    {"error":"<message>"}                     (failure — non-zero exit)

Stderr — free-form human logs.

── Why it is shaped this way ────────────────────────────────────────────────
~929k rows need embedding on a 4 vCPU / 8 GB box with no GPU. That is many
hours of CPU inference, so the job must survive being killed:

  * Resumable. Work is selected by `ai_embedding IS NULL` and committed every
    chunk, so a crash, a deploy, or a time-budget exit loses at most one chunk.
  * Keyset pagination on `sku` (unique btree) rather than OFFSET, so page N
    costs the same as page 1 — and so `--all` cannot loop forever.
  * Bounded memory. Rows are pulled one chunk at a time; peak RSS is the model
    plus one chunk, never proportional to the 929k backlog.
  * Time-budgeted. A nightly run stops cleanly at the budget instead of
    bleeding into business hours; the next run picks up where it left off.
  * Single-flight via a Postgres advisory lock, which holds across *processes
    and pods* — a Node-side mutex would not stop a second replica's cron.
  * Resource-adaptive. Thread count and encode batch size are derived from the
    CPU and memory actually available (cgroup limits included, so this is
    correct inside Docker) and scale up on their own if the box is resized.

Env (all optional — every one has a derived default):
    AI_EMBED_BATCH_SIZE, AI_EMBED_CHUNK_SIZE, AI_EMBED_THREADS,
    AI_EMBED_MAX_RUNTIME_MIN, AI_EMBED_THROTTLE_MS
    DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, POSTGRES_SSL
"""

import argparse
import json
import os
import signal
import sys
import time
import traceback

MODEL_NAME = 'BAAI/bge-base-en-v1.5'
SSL_CA_PATH = 'cert/db-ca-certificate.crt'

# Fixed key so every process — cron, CLI, a second pod — contends for the same
# lock. Derived by hand rather than from hashtext() so it can never drift.
ADVISORY_LOCK_KEY = 8471120250001

DEFAULT_MAX_RUNTIME_MIN = 300

_stop = {'requested': False, 'reason': None}


def emit(payload):
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


def log(msg):
    sys.stderr.write(f'[backfill_ai_embedding] {msg}\n')
    sys.stderr.flush()


def _install_signal_handlers():
    """Finish the chunk in flight, commit it, then exit 0.

    SIGTERM is what a container recycle or `docker stop` sends. Dying mid-chunk
    would be safe (the transaction rolls back) but pointlessly throws away up to
    a chunk of inference, so we cooperate instead.
    """

    def handler(signum, _frame):
        name = signal.Signals(signum).name
        _stop['requested'] = True
        _stop['reason'] = f'received {name}'
        log(f'{name} received — finishing current chunk, then exiting')

    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, handler)


# ── resource detection ──────────────────────────────────────────────────────


def _read_int(path):
    try:
        with open(path) as fh:
            return int(fh.read().strip())
    except (OSError, ValueError):
        return None


def detect_cpus():
    """Effective CPU count, honouring cgroup quota and scheduler affinity.

    os.cpu_count() reports the *host* inside a container, which would have us
    spawn 4x the threads the cgroup will actually schedule — that thrashes
    rather than speeds anything up.
    """
    try:
        cpus = len(os.sched_getaffinity(0))
    except AttributeError:
        cpus = os.cpu_count() or 2

    # cgroup v2
    try:
        with open('/sys/fs/cgroup/cpu.max') as fh:
            quota_raw, period_raw = fh.read().split()
        if quota_raw != 'max':
            quota = max(1, int(int(quota_raw) / int(period_raw)))
            cpus = min(cpus, quota)
    except (OSError, ValueError):
        # cgroup v1
        quota = _read_int('/sys/fs/cgroup/cpu/cpu.cfs_quota_us')
        period = _read_int('/sys/fs/cgroup/cpu/cpu.cfs_period_us')
        if quota and period and quota > 0:
            cpus = min(cpus, max(1, int(quota / period)))

    return max(1, cpus)


def detect_available_mb():
    """Memory this process may realistically use, in MB.

    Prefers the cgroup limit (what Docker will actually enforce) over the host's
    MemAvailable, and takes the smaller of the two when both are known.
    """
    available = None
    try:
        with open('/proc/meminfo') as fh:
            for line in fh:
                if line.startswith('MemAvailable:'):
                    available = int(line.split()[1]) // 1024
                    break
    except (OSError, ValueError, IndexError):
        pass

    limit = _read_int('/sys/fs/cgroup/memory.max')
    if limit is None:
        limit = _read_int('/sys/fs/cgroup/memory/memory.limit_in_bytes')
    if limit is not None and limit < (1 << 62):
        usage = _read_int('/sys/fs/cgroup/memory.current')
        if usage is None:
            usage = _read_int('/sys/fs/cgroup/memory/memory.usage_in_bytes') or 0
        cgroup_free = max(0, (limit - usage)) // (1024 * 1024)
        available = cgroup_free if available is None else min(available, cgroup_free)

    return available if available else 2048


def derive_settings(args):
    cpus = detect_cpus()
    available_mb = detect_available_mb()

    threads = args.threads or _env_int('AI_EMBED_THREADS')
    if not threads:
        # Leave one core for the DB client, the OS, and the co-located API
        # process. On a 4 vCPU box that is 3; resize to 16 and it becomes 15.
        threads = max(1, cpus - 1)

    batch_size = args.batch_size or _env_int('AI_EMBED_BATCH_SIZE')
    if not batch_size:
        # BGE-base at 512 tokens costs roughly 50 MB of activations per unit of
        # batch. Reserve ~1 GB for the model itself and spend a third of what is
        # left, so the job stays a good neighbour rather than filling the box.
        spendable = max(0, available_mb - 1024) / 3
        batch_size = int(min(128, max(8, spendable / 50)))

    chunk_size = args.chunk_size or _env_int('AI_EMBED_CHUNK_SIZE')
    if not chunk_size:
        # One DB round trip should carry many encode batches, but a chunk is
        # also the unit of lost work on a crash — keep it minutes, not hours.
        chunk_size = int(min(4096, max(256, batch_size * 16)))

    return {
        'cpus': cpus,
        'available_mb': available_mb,
        'threads': threads,
        'batch_size': batch_size,
        'chunk_size': chunk_size,
    }


def _env_int(name):
    raw = os.environ.get(name)
    if not raw:
        return None
    try:
        value = int(raw)
        return value if value > 0 else None
    except ValueError:
        log(f'ignoring non-numeric {name}={raw!r}')
        return None


# ── database ────────────────────────────────────────────────────────────────


def db_connect():
    import psycopg2

    kwargs = {
        'host': os.environ['DB_HOST'],
        'port': int(os.environ.get('DB_PORT', '5432')),
        'user': os.environ['DB_USERNAME'],
        'password': os.environ['DB_PASSWORD'],
        'dbname': os.environ['DB_DATABASE'],
    }
    if os.environ.get('POSTGRES_SSL', 'false').lower() == 'true':
        kwargs['sslmode'] = 'verify-full'
        if os.path.exists(SSL_CA_PATH):
            kwargs['sslrootcert'] = SSL_CA_PATH
    return psycopg2.connect(**kwargs)


def verify_column(cur):
    cur.execute(
        "SELECT format_type(a.atttypid, a.atttypmod) "
        "FROM pg_attribute a "
        "WHERE a.attrelid = 'audios'::regclass AND a.attnum > 0 "
        "  AND NOT a.attisdropped AND a.attname = 'ai_embedding'"
    )
    row = cur.fetchone()
    if not row:
        raise RuntimeError(
            'audios.ai_embedding is missing. Run migrations first '
            '(AddAiColumnsToAudios1785000000000).'
        )
    if row[0] != 'vector(768)':
        raise RuntimeError(
            f'audios.ai_embedding is {row[0]}, expected vector(768). '
            f'{MODEL_NAME} emits 768 dimensions.'
        )


SELECT_SQL = """
    SELECT sku, display_title, display_description
      FROM audios
     WHERE {predicate}
       AND deleted_at IS NULL
       AND sku > %s
       AND (coalesce(display_title, '') <> '' OR coalesce(display_description, '') <> '')
     ORDER BY sku
     LIMIT %s
"""

COUNT_SQL = """
    SELECT count(*)
      FROM audios
     WHERE {predicate}
       AND deleted_at IS NULL
       AND (coalesce(display_title, '') <> '' OR coalesce(display_description, '') <> '')
"""


def vec_to_pgtext(vec):
    return '[' + ','.join(f'{float(x):.6f}' for x in vec) + ']'


# ── main ────────────────────────────────────────────────────────────────────


def parse_args():
    p = argparse.ArgumentParser(description='Backfill audios.ai_embedding')
    p.add_argument('--limit', type=int, default=0,
                   help='stop after N rows (0 = no limit). Useful for a smoke test.')
    p.add_argument('--max-runtime-min', type=int, default=None,
                   help=f'stop cleanly after N minutes (0 = unlimited, default {DEFAULT_MAX_RUNTIME_MIN})')
    p.add_argument('--batch-size', type=int, default=None, help='encode batch size (default: derived)')
    p.add_argument('--chunk-size', type=int, default=None, help='rows per DB round trip (default: derived)')
    p.add_argument('--threads', type=int, default=None, help='torch threads (default: cpus - 1)')
    p.add_argument('--all', action='store_true',
                   help='re-embed every row, not just the NULL ones (full rebuild of the column)')
    return p.parse_args()


def main():
    args = parse_args()
    _install_signal_handlers()

    max_runtime_min = args.max_runtime_min
    if max_runtime_min is None:
        max_runtime_min = _env_int('AI_EMBED_MAX_RUNTIME_MIN')
    if max_runtime_min is None:
        max_runtime_min = DEFAULT_MAX_RUNTIME_MIN
    deadline = time.monotonic() + max_runtime_min * 60 if max_runtime_min > 0 else None

    throttle_ms = _env_int('AI_EMBED_THROTTLE_MS') or 0

    settings = derive_settings(args)
    log(
        f"resources: {settings['cpus']} cpu, {settings['available_mb']} MB available "
        f"→ threads={settings['threads']} batch_size={settings['batch_size']} "
        f"chunk_size={settings['chunk_size']}"
    )

    # Thread caps must be set before torch is imported, or the OpenMP pool is
    # already sized by the time we could ask for something smaller.
    os.environ.setdefault('OMP_NUM_THREADS', str(settings['threads']))
    os.environ.setdefault('MKL_NUM_THREADS', str(settings['threads']))
    os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')

    from psycopg2.extras import execute_values

    conn = db_connect()
    conn.autocommit = False
    cur = conn.cursor()

    # Session-level advisory lock. Released implicitly when this connection
    # closes, including on a hard kill — no stale lock to clean up by hand.
    cur.execute('SELECT pg_try_advisory_lock(%s)', (ADVISORY_LOCK_KEY,))
    if not cur.fetchone()[0]:
        conn.rollback()
        cur.close()
        conn.close()
        log('another backfill holds the advisory lock — exiting without work')
        emit({'done': True, 'processed': 0, 'updated': 0,
              'interrupted': False, 'reason': 'already running elsewhere'})
        return

    try:
        verify_column(cur)
        predicate = 'TRUE' if args.all else 'ai_embedding IS NULL'

        cur.execute(COUNT_SQL.format(predicate=predicate))
        remaining = cur.fetchone()[0]
        conn.commit()
        log(f'{remaining} rows to embed (mode={"all" if args.all else "missing-only"})')

        if remaining == 0:
            emit({'done': True, 'processed': 0, 'updated': 0,
                  'interrupted': False, 'reason': 'nothing to do'})
            return

        import numpy as np
        import torch
        from sentence_transformers import SentenceTransformer

        torch.set_num_threads(settings['threads'])
        # First run on a cold HF cache downloads ~440 MB here; without a line
        # on stdout the job looks hung for minutes.
        emit({'stage': 'model_loading', 'model': MODEL_NAME, 'to_embed': remaining})
        log(f'loading model {MODEL_NAME} (torch threads={torch.get_num_threads()})…')
        model = SentenceTransformer(MODEL_NAME)

        processed = 0
        updated = 0
        last_sku = ''
        started = time.monotonic()
        reason = 'completed'

        while True:
            if _stop['requested']:
                reason = _stop['reason']
                break
            if deadline and time.monotonic() >= deadline:
                reason = f'time budget of {max_runtime_min} min reached'
                log(reason)
                break

            limit = settings['chunk_size']
            if args.limit:
                left = args.limit - processed
                if left <= 0:
                    reason = f'--limit {args.limit} reached'
                    break
                limit = min(limit, left)

            cur.execute(SELECT_SQL.format(predicate=predicate), (last_sku, limit))
            rows = cur.fetchall()
            conn.commit()
            if not rows:
                break

            texts = [f'{title or ""} {desc or ""}'.strip() for _, title, desc in rows]
            vectors = model.encode(
                texts,
                batch_size=settings['batch_size'],
                normalize_embeddings=True,
                show_progress_bar=False,
                convert_to_numpy=True,
            ).astype(np.float32)

            payload = [
                (sku, vec_to_pgtext(vec)) for (sku, _, _), vec in zip(rows, vectors)
            ]
            execute_values(
                cur,
                'UPDATE audios AS a SET ai_embedding = v.vec::vector '
                'FROM (VALUES %s) AS v(sku, vec) WHERE a.sku = v.sku',
                payload,
                template='(%s::varchar, %s::text)',
                page_size=len(payload),
            )
            updated += cur.rowcount
            conn.commit()

            processed += len(rows)
            last_sku = rows[-1][0]

            # One line per chunk rather than every N rows: a chunk is the unit
            # of committed work, and gating on a row count meant a short run
            # (a --limit smoke test) finished without ever reporting anything.
            elapsed_min = (time.monotonic() - started) / 60
            rate = processed / elapsed_min if elapsed_min > 0 else 0
            left = max(0, remaining - processed)
            emit({
                'stage': 'embedding',
                'processed': processed,
                'updated': updated,
                'remaining': left,
                'rate_per_min': round(rate, 1),
                'eta_min': round(left / rate, 1) if rate > 0 else None,
            })

            if throttle_ms:
                time.sleep(throttle_ms / 1000)

        elapsed_min = (time.monotonic() - started) / 60
        log(f'{reason}: {processed} embedded, {updated} rows updated in {elapsed_min:.1f} min')
        emit({
            'done': True,
            'processed': processed,
            'updated': updated,
            'interrupted': reason != 'completed',
            'reason': reason,
        })
    finally:
        try:
            conn.rollback()
            cur.execute('SELECT pg_advisory_unlock(%s)', (ADVISORY_LOCK_KEY,))
            conn.commit()
        except Exception:
            pass
        cur.close()
        conn.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit({'error': str(exc)})
        log(traceback.format_exc())
        sys.exit(1)
