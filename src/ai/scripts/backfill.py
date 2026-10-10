"""Resumable backfill of an `audios` pgvector column.

The model and the per-column source text come verbatim from the AI developer's
scripts — ai/AIEmbedding.py for AI_Class_Vector, ai/CronDBUpdate.py for
ai_embedding — so new vectors are comparable to the ones already stored. The
machinery around them is built for a 1.4M-title catalogue on a small box: no
hardcoded credentials, no CSV round-trip, bounded memory, and a one-shot script
becomes a job that can be stopped and resumed at any point.

Invocation:
    python3 backfill.py --job {class-vector|embedding|categories}
                        [--limit N] [--max-runtime-min N]
                        [--batch-size N] [--chunk-size N]
                        [--threads N] [--all]

Three jobs, one engine. They feed different features and are NOT
interchangeable:

    class-vector  audios."AI_Class_Vector" — the Active-Based List pipeline,
                  finding inactive titles similar to those already on the shelf
    embedding     audios.ai_embedding — prompt search in the admin panel
                  ("recommendations from a book description")
    categories    audios.ai_categories — three genre labels per title, from a
                  local LLM rather than an embedding model

Both hold a 768-dim BGE embedding, but from DIFFERENT source text:

    AI_Class_Vector  display_title + ' ' + display_description
    ai_embedding     display_description

Everything else — resumability, batching, locking, resource sizing — is
identical, so one engine serves both rather than duplicating the hard parts and
having to fix each bug twice.

Both columns are written L2-normalised. CronDBUpdate.py omitted that for
ai_embedding, so the 518k rows it produced carry arbitrary magnitudes. Direction
is all that cosine search uses, so this changes no result today — but it leaves
the column mixed. To finish the job, normalise the legacy rows once:

    UPDATE audios SET ai_embedding = l2_normalize(ai_embedding)
     WHERE ai_embedding IS NOT NULL;      -- pgvector >= 0.7, direction-preserving

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

  * Resumable. Work is selected by `<column> IS NULL` and committed every
    chunk, so a crash, a deploy, or a time-budget exit loses at most one chunk.
    This is what the script it replaces got wrong: embed_new_inactive.py held a
    single transaction open for the whole run and committed once at the end, so
    the runner's 3-hour timeout rolled back every row it had embedded. The job
    needs ~10.7 hours, so it could never finish, and it failed 24 nights running
    while discarding three hours of inference each time.
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
    AI_BACKFILL_BATCH_SIZE, AI_BACKFILL_CHUNK_SIZE, AI_BACKFILL_THREADS,
    AI_BACKFILL_MAX_RUNTIME_MIN, AI_BACKFILL_THROTTLE_MS
    DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, POSTGRES_SSL
"""

import argparse
import json
import os
import re
import signal
import sys
import time
import traceback

MODEL_NAME = 'BAAI/bge-base-en-v1.5'
SSL_CA_PATH = 'cert/db-ca-certificate.crt'

# Per-column config. The advisory lock keys differ so a backfill of one column
# never blocks the other — they are independent work. They do contend for CPU on
# a small box, which is a scheduling concern, not a correctness one.
# One engine, three jobs. Each fills a different column of `audios` and they
# are NOT interchangeable — a vector built from the wrong source text looks
# valid and quietly degrades every similarity result against the rows already
# stored.
#
#   kind       which generator produces the value
#   column     bare column name, for the catalogue type check
#   sql        column identifier, quoted where the mixed case demands it
#   type       expected Postgres type — a mismatch fails the run, loudly
#   cast       SQL cast applied to the generated value
#   lock       advisory lock key; distinct per job so jobs never block each other
#   source     SQL predicate for "this row has the text this job needs"
#   text       how that text is assembled before generation
#   normalize  embedding jobs only: normalize_embeddings
#
# Source text is carried over verbatim from the AI developer's scripts:
#   class-vector  AIEmbedding.py:37    row[1] + ' ' + row[2]
#   embedding     CronDBUpdate.py:39   row[1]   (display_description alone)
#   categories    AICatV3.ipynb        display_description
#
# The `or ''` guards are the one deviation, and change nothing for a row that
# has its text — the originals simply raise TypeError on a NULL.
JOBS = {
    'class-vector': {
        'kind': 'embedding',
        'column': 'AI_Class_Vector',
        'sql': '"AI_Class_Vector"',
        'type': 'vector(768)',
        'cast': '::vector',
        'lock': 8471120250002,
        'source': (
            "(coalesce(display_title, '') <> '' "
            "OR coalesce(display_description, '') <> '')"
        ),
        'text': lambda title, desc: (title or '') + ' ' + (desc or ''),
        'normalize': True,
    },
    'embedding': {
        'kind': 'embedding',
        'column': 'ai_embedding',
        'sql': 'ai_embedding',
        'type': 'vector(768)',
        'cast': '::vector',
        'lock': 8471120250001,
        'source': "coalesce(display_description, '') <> ''",
        'text': lambda title, desc: desc or '',
        'normalize': True,
    },
    'categories': {
        'kind': 'categories',
        'column': 'ai_categories',
        'sql': 'ai_categories',
        'type': 'character varying(250)',
        'cast': '',
        'lock': 8471120250003,
        'source': "coalesce(display_description, '') <> ''",
        'text': lambda title, desc: desc or '',
        'normalize': None,
    },
}

# Categories are generated by a local LLM over HTTP rather than a local model.
# The endpoint is configurable because the AI developer's notebook hardcodes
# localhost, which only ever existed on his machine.
OLLAMA_URL = os.environ.get('AI_OLLAMA_URL', 'http://localhost:11434/api/generate')
OLLAMA_MODEL = os.environ.get('AI_OLLAMA_MODEL', 'qwen2.5:1.5b')
OLLAMA_TIMEOUT_S = 60
CATEGORIES_MAX_LEN = 250  # audios.ai_categories is varchar(250)

DEFAULT_MAX_RUNTIME_MIN = 300

_stop = {'requested': False, 'reason': None}


def emit(payload):
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


def log(msg):
    sys.stderr.write(f'[backfill] {msg}\n')
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

    threads = args.threads or _env_int('AI_BACKFILL_THREADS')
    if not threads:
        # Leave one core for the DB client, the OS, and the co-located API
        # process. On a 4 vCPU box that is 3; resize to 16 and it becomes 15.
        threads = max(1, cpus - 1)

    batch_size = args.batch_size or _env_int('AI_BACKFILL_BATCH_SIZE')
    if not batch_size:
        # BGE-base at 512 tokens costs roughly 50 MB of activations per unit of
        # batch. Reserve ~1 GB for the model itself and spend a third of what is
        # left, so the job stays a good neighbour rather than filling the box.
        spendable = max(0, available_mb - 1024) / 3
        batch_size = int(min(128, max(8, spendable / 50)))

    chunk_size = args.chunk_size or _env_int('AI_BACKFILL_CHUNK_SIZE')
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


def verify_column(cur, column, expected_type):
    cur.execute(
        "SELECT format_type(a.atttypid, a.atttypmod) "
        "FROM pg_attribute a "
        "WHERE a.attrelid = 'audios'::regclass AND a.attnum > 0 "
        "  AND NOT a.attisdropped AND a.attname = %s",
        (column,),
    )
    row = cur.fetchone()
    if not row:
        raise RuntimeError(
            f'audios.{column} is missing. Run migrations first '
            '(AddAiColumnsToAudios1785000000000).'
        )
    if row[0] != expected_type:
        raise RuntimeError(
            f'audios.{column} is {row[0]}, expected {expected_type}.'
        )


SELECT_SQL = """
    SELECT sku, display_title, display_description
      FROM audios
     WHERE {predicate}
       AND deleted_at IS NULL
       AND is_excluded = false
       AND sku > %s
       AND {source}
     ORDER BY sku
     LIMIT %s
"""

COUNT_SQL = """
    SELECT count(*)
      FROM audios
     WHERE {predicate}
       AND deleted_at IS NULL
       AND is_excluded = false
       AND {source}
"""


def make_embedding_generator(job, settings, remaining):
    """Batch-encode with BGE. Returns texts -> list of pgvector literals."""
    import numpy as np
    import torch
    from sentence_transformers import SentenceTransformer

    torch.set_num_threads(settings['threads'])
    # First run on a cold HF cache downloads ~440 MB here; without a line on
    # stdout the job looks hung for minutes.
    emit({'stage': 'model_loading', 'model': MODEL_NAME,
          'column': job['column'], 'to_embed': remaining})
    log(f'loading model {MODEL_NAME} (torch threads={torch.get_num_threads()})…')
    model = SentenceTransformer(MODEL_NAME)

    def generate(texts):
        vectors = model.encode(
            texts,
            batch_size=settings['batch_size'],
            normalize_embeddings=job['normalize'],
            show_progress_bar=False,
            convert_to_numpy=True,
        ).astype(np.float32)
        return [vec_to_pgtext(v) for v in vectors]

    return generate


def make_categories_generator(job, settings, remaining):
    """Three genres per row from a local LLM. Returns texts -> list of strings.

    Prompt, fallback and parsing are carried over from the AI developer's
    AICatV3.ipynb so labels stay consistent with the rows already stored. Two
    things are added: the endpoint is configurable rather than hardcoded to
    localhost, and the result is clamped to the column width — the original
    would raise a StringDataRightTruncation the first time the model returned
    three long genre names.

    One HTTP round trip per row, so this is the slow job by a wide margin. It
    is a separate cron for exactly that reason.
    """
    import requests

    emit({'stage': 'model_loading', 'model': OLLAMA_MODEL,
          'column': job['column'], 'to_embed': remaining})
    log(f'using Ollama at {OLLAMA_URL} (model {OLLAMA_MODEL})')

    def ask(prompt, json_mode):
        body = {'model': OLLAMA_MODEL, 'prompt': prompt, 'stream': False}
        if json_mode:
            body['format'] = 'json'
            body['options'] = {'temperature': 0.1, 'num_predict': 30}
        r = requests.post(OLLAMA_URL, json=body, timeout=OLLAMA_TIMEOUT_S)
        r.raise_for_status()
        return r.json()['response']

    def parse_json_array(text):
        for candidate in (text.strip(), None):
            if candidate is None:
                match = re.search(r'\[.*?\]', text, re.DOTALL)
                if not match:
                    return []
                candidate = match.group()
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, list):
                items = [str(i).strip() for i in parsed if str(i).strip()]
                if items:
                    return items[:3]
        return []

    def parse_lines(text):
        genres = []
        for line in text.splitlines():
            line = re.sub(r'^[\-\*\d\.\)\s]+', '', line.strip())
            if ':' in line:
                line = line.split(':')[0].strip()
            if line and len(line) < 40:
                genres.append(line)
        return list(dict.fromkeys(genres))[:3]

    def one(description):
        try:
            genres = parse_json_array(ask(description_prompt(description), True))
            if genres:
                return genres
        except requests.RequestException as exc:
            log(f'ollama json-mode call failed: {exc}')
        try:
            return parse_lines(ask(loose_prompt(description), False))
        except requests.RequestException as exc:
            log(f'ollama fallback call failed: {exc}')
            return []

    def generate(texts):
        out = []
        for text in texts:
            joined = ','.join(one(text))
            if len(joined) > CATEGORIES_MAX_LEN:
                # Trim whole genres rather than mid-word, so a truncated value
                # is still a valid comma-separated list.
                kept = []
                for part in joined.split(','):
                    if len(','.join(kept + [part])) > CATEGORIES_MAX_LEN:
                        break
                    kept.append(part)
                joined = ','.join(kept)
            out.append(joined)
        return out

    return generate


def description_prompt(description):
    return f"""
    Return a JSON array of exactly 3 book genres.

    Rules:
    - Return ONLY valid JSON
    - No explanation
    - No markdown
    - No additional text
    - Each genre must be concise

    Description:
    {description}
    """


def loose_prompt(description):
    return f"""
    Return 3 book genres.

    Rules:
    - One genre per line
    - No numbering
    - No explanations

    Description:
    {description}
    """


GENERATORS = {
    'embedding': make_embedding_generator,
    'categories': make_categories_generator,
}


def vec_to_pgtext(vec):
    return '[' + ','.join(f'{float(x):.6f}' for x in vec) + ']'


# ── main ────────────────────────────────────────────────────────────────────


def parse_args():
    p = argparse.ArgumentParser(description='Backfill an audios AI column')
    p.add_argument('--job', required=True, choices=sorted(JOBS),
                   help='which column to fill — the jobs serve different features')
    p.add_argument('--limit', type=int, default=0,
                   help='stop after N rows (0 = no limit). Useful for a smoke test.')
    p.add_argument('--max-runtime-min', type=int, default=None,
                   help=f'stop cleanly after N minutes (0 = unlimited, default {DEFAULT_MAX_RUNTIME_MIN})')
    p.add_argument('--batch-size', type=int, default=None, help='encode batch size (default: derived)')
    p.add_argument('--chunk-size', type=int, default=None, help='rows per DB round trip (default: derived)')
    p.add_argument('--threads', type=int, default=None, help='torch threads (default: cpus - 1)')
    p.add_argument('--all', action='store_true',
                   help='regenerate every row, not just the NULL ones (full rebuild)')
    return p.parse_args()


def main():
    args = parse_args()
    _install_signal_handlers()

    job = JOBS[args.job]
    # argparse restricts --job to the keys of JOBS, so this identifier is never
    # attacker-controlled; it is interpolated rather than bound because a column
    # name cannot be a query parameter.
    column_sql = job['sql']

    max_runtime_min = args.max_runtime_min
    if max_runtime_min is None:
        max_runtime_min = _env_int('AI_BACKFILL_MAX_RUNTIME_MIN')
    if max_runtime_min is None:
        max_runtime_min = DEFAULT_MAX_RUNTIME_MIN
    deadline = time.monotonic() + max_runtime_min * 60 if max_runtime_min > 0 else None

    throttle_ms = _env_int('AI_BACKFILL_THROTTLE_MS') or 0

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
    cur.execute('SELECT pg_try_advisory_lock(%s)', (job['lock'],))
    if not cur.fetchone()[0]:
        conn.rollback()
        cur.close()
        conn.close()
        log(f'another {args.job} backfill holds the advisory lock — exiting without work')
        emit({'done': True, 'processed': 0, 'updated': 0,
              'interrupted': False, 'reason': 'already running elsewhere'})
        return

    try:
        verify_column(cur, job['column'], job['type'])
        predicate = 'TRUE' if args.all else f'{column_sql} IS NULL'

        cur.execute(
            COUNT_SQL.format(predicate=predicate, source=job['source'])
        )
        remaining = cur.fetchone()[0]
        conn.commit()
        log(f'{remaining} rows to fill into audios.{job["column"]} '
            f'(mode={"all" if args.all else "missing-only"})')

        if remaining == 0:
            emit({'done': True, 'processed': 0, 'updated': 0,
                  'interrupted': False, 'reason': 'nothing to do'})
            return

        generate = GENERATORS[job['kind']](job, settings, remaining)

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

            cur.execute(
                SELECT_SQL.format(predicate=predicate, source=job['source']),
                (last_sku, limit),
            )
            rows = cur.fetchall()
            conn.commit()
            if not rows:
                break

            build_text = job['text']
            texts = [build_text(title, desc) for _, title, desc in rows]
            values = generate(texts)
            payload = [
                (sku, value) for (sku, _, _), value in zip(rows, values)
            ]
            # updated_at is bumped deliberately. recommender.py's delta ingest
            # selects `WHERE a.updated_at > <watermark>`, and audios has no
            # trigger on updated_at — TypeORM's @UpdateDateColumn only fires for
            # writes TypeORM itself makes, not for raw SQL like this. Without
            # the bump, every row this job embeds stays invisible to the FAISS
            # index forever: "Refresh AI Index" reports 0 added while the
            # "with embeddings" count climbs.
            #
            # Safe to touch: recommender.py is the only consumer of
            # audios.updated_at. Elasticsearch sync keys off
            # audio_metadata.metadata_signature, and the client-facing
            # updated_at values come from audio_user_statuses, not here.
            execute_values(
                cur,
                f'UPDATE audios AS a SET {column_sql} = v.val{job["cast"]}, '
                'updated_at = now() '
                'FROM (VALUES %s) AS v(sku, val) WHERE a.sku = v.sku',
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
            cur.execute('SELECT pg_advisory_unlock(%s)', (job['lock'],))
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
