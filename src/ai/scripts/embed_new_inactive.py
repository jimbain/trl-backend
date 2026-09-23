"""One-shot job: embed inactive audios that are missing an AI_Class_Vector.

Adapted from the AI dev's manual monthly workflow
(ai/AIEmbedding.py + the temp-table UPDATE step). Removes hardcoded DB
credentials and the CSV export/manual-import round-trip — writes straight
to `ai_embedding_import_temp` and issues the UPDATE in the same
transaction.

Invocation: `python3 embed_new_inactive.py`

Stdout — one JSON object per line (parsed by the Node runner service):
  {"stage": "embedding", "processed": N, "total": M}   (progress, periodic)
  {"done": true, "processed": N, "updated": M}         (success)
  {"error": "<message>"}                               (failure — non-zero exit)

Stderr — free-form human logs.

Env: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, POSTGRES_SSL.
"""

import json
import os
import sys
import traceback

import numpy as np
import psycopg2
from psycopg2.extras import execute_values
from sentence_transformers import SentenceTransformer

MODEL_NAME = 'BAAI/bge-base-en-v1.5'
SSL_CA_PATH = 'cert/db-ca-certificate.crt'
ENCODE_BATCH_SIZE = 32
DB_INSERT_BATCH_SIZE = 500
PROGRESS_EVERY = 500


def emit(payload):
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


def log(msg):
    sys.stderr.write(f'[embed_new_inactive.py] {msg}\n')
    sys.stderr.flush()


def db_connect():
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


def vec_to_pgtext(vec: np.ndarray) -> str:
    # pgvector accepts a string literal like '[0.1,0.2,...]' when the target
    # column is `vector`. We store into a text staging column first, then cast
    # during the UPDATE.
    return '[' + ','.join(f'{float(x):.6f}' for x in vec) + ']'


def main():
    conn = db_connect()
    conn.autocommit = False
    cur = conn.cursor()

    # Idempotent guard: the migration should have created this, but ensure it
    # anyway so the script is safe to run in a partially-migrated env.
    cur.execute(
        'CREATE UNLOGGED TABLE IF NOT EXISTS ai_embedding_import_temp '
        '(sku_temp varchar, ai_vector text)'
    )
    cur.execute('TRUNCATE ai_embedding_import_temp')

    # Verify the target column exists before we bother computing embeddings.
    cur.execute(
        "SELECT udt_name FROM information_schema.columns "
        "WHERE table_name = 'audios' AND column_name = 'AI_Class_Vector'"
    )
    row = cur.fetchone()
    if not row or row[0] != 'vector':
        raise RuntimeError(
            'audios."AI_Class_Vector" column missing or not pgvector type. '
            "AI dev's one-time setup is incomplete."
        )

    cur.execute(
        # Excluded titles are never recommended, so there is nothing to gain
        # from spending embedding time on them.
        'SELECT sku, display_title, display_description FROM audios '
        'WHERE is_active = false AND is_excluded = false '
        'AND "AI_Class_Vector" IS NULL '
        'AND deleted_at IS NULL '
        'ORDER BY sku ASC'
    )
    rows = cur.fetchall()
    total = len(rows)
    log(f'found {total} inactive audios needing embeddings')

    if total == 0:
        emit({'done': True, 'processed': 0, 'updated': 0})
        cur.close()
        conn.close()
        return

    log(f'loading model {MODEL_NAME}...')
    model = SentenceTransformer(MODEL_NAME)

    processed = 0
    pending: list[tuple[str, str]] = []
    for sku, title, description in rows:
        text = f'{title or ""} {description or ""}'.strip()
        vec = model.encode(text, normalize_embeddings=True)
        pending.append((sku, vec_to_pgtext(np.asarray(vec, dtype=np.float32))))
        processed += 1

        if len(pending) >= DB_INSERT_BATCH_SIZE:
            execute_values(
                cur,
                'INSERT INTO ai_embedding_import_temp (sku_temp, ai_vector) VALUES %s',
                pending,
            )
            pending.clear()

        if processed % PROGRESS_EVERY == 0:
            emit({'stage': 'embedding', 'processed': processed, 'total': total})

    if pending:
        execute_values(
            cur,
            'INSERT INTO ai_embedding_import_temp (sku_temp, ai_vector) VALUES %s',
            pending,
        )

    # Cast the staged text into the pgvector column in one shot.
    cur.execute(
        'UPDATE audios AS a '
        'SET "AI_Class_Vector" = t.ai_vector::vector '
        'FROM ai_embedding_import_temp AS t '
        'WHERE a.sku = t.sku_temp'
    )
    updated = cur.rowcount

    cur.execute('TRUNCATE ai_embedding_import_temp')
    conn.commit()
    cur.close()
    conn.close()

    emit({'done': True, 'processed': processed, 'updated': updated})


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit({'error': str(exc)})
        log(traceback.format_exc())
        sys.exit(1)
