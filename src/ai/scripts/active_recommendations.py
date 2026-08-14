"""One-shot job: rank inactive audios by similarity to the active catalog and
write the top-N into `ai_recommended_active_audios` tagged with a batch_id.

Adapted from ai/AIActiveList.py. Removes hardcoded DB creds + CSV export in
favour of direct DB insert. Parameters that were hardcoded in the original
(top_n=1000, top_k_per_active=50) are now CLI args driven from app_configs
via the Node runner.

Invocation:
  python3 active_recommendations.py --batch-id <uuid> --top-n 1000 \
                                    --top-k-per-active 50

Stdout — one JSON object per line:
  {"stage": "ranking", "processed_active": N, "total_active": M}
  {"done": true, "rows": N}
  {"error": "<message>"}

Env: DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, POSTGRES_SSL.
"""

import argparse
import json
import os
import sys
import traceback
from collections import defaultdict
from datetime import datetime

import numpy as np
import psycopg2
from psycopg2.extras import execute_values
from pgvector.psycopg2 import register_vector

SSL_CA_PATH = 'cert/db-ca-certificate.crt'
CANDIDATE_LOAD_BATCH_SIZE = 5000
FREQUENCY_THRESHOLD = 0.80
FINAL_SCORE_WEIGHTS = {
    'max_similarity': 0.45,
    'avg_top10': 0.35,
    'frequency': 0.20,
}
PROGRESS_EVERY = 100
DB_INSERT_BATCH_SIZE = 500


def emit(payload):
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


def log(msg):
    sys.stderr.write(f'[active_recommendations.py] {msg}\n')
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


def verify_setup(cur):
    cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector'")
    if not cur.fetchone():
        raise RuntimeError('pgvector extension not installed on this database.')

    cur.execute(
        "SELECT udt_name FROM information_schema.columns "
        "WHERE table_name = 'audios' AND column_name = 'AI_Class_Vector'"
    )
    row = cur.fetchone()
    if not row or row[0] != 'vector':
        raise RuntimeError(
            'audios."AI_Class_Vector" column missing or wrong type.'
        )

    cur.execute(
        'SELECT vector_dims("AI_Class_Vector") FROM audios '
        'WHERE "AI_Class_Vector" IS NOT NULL LIMIT 1'
    )
    dim_row = cur.fetchone()
    if not dim_row:
        raise RuntimeError(
            'no populated AI_Class_Vector rows found. Run embed_new_inactive.py first.'
        )
    log(f'embedding dimension: {dim_row[0]}')


def load_active_books(conn):
    cur = conn.cursor()
    cur.execute(
        'SELECT sku, display_title, "AI_Class_Vector" '
        'FROM audios '
        'WHERE is_active = true '
        '  AND "AI_Class_Vector" IS NOT NULL '
        '  AND deleted_at IS NULL '
        'ORDER BY sku'
    )
    rows = cur.fetchall()
    cur.close()

    if not rows:
        raise RuntimeError('no active books with AI_Class_Vector found.')

    skus = [r[0] for r in rows]
    embeddings = np.vstack([np.asarray(r[2], dtype=np.float32) for r in rows])
    log(f'loaded {len(skus)} active books, embedding shape {embeddings.shape}')
    return skus, embeddings


def get_similar_inactive(conn, active_embedding, top_k):
    cur = conn.cursor()
    cur.execute(
        'SELECT sku '
        'FROM audios '
        'WHERE is_active = false AND deleted_at IS NULL '
        'ORDER BY "AI_Class_Vector" <=> %s::vector '
        'LIMIT %s',
        (active_embedding, top_k),
    )
    rows = cur.fetchall()
    cur.close()
    return [r[0] for r in rows]


def load_candidate_embeddings(conn, candidate_ids):
    cur = conn.cursor()
    total = len(candidate_ids)
    order: list[str] = []
    titles: dict[str, str] = {}
    vectors: dict[str, np.ndarray] = {}

    for start in range(0, total, CANDIDATE_LOAD_BATCH_SIZE):
        batch = candidate_ids[start:start + CANDIDATE_LOAD_BATCH_SIZE]
        cur.execute(
            'SELECT sku, display_title, "AI_Class_Vector" '
            'FROM audios WHERE sku = ANY(%s) AND deleted_at IS NULL',
            (batch,),
        )
        for sku, title, vec in cur.fetchall():
            if sku in vectors:
                continue
            vectors[sku] = np.asarray(vec, dtype=np.float32)
            titles[sku] = title or ''
            order.append(sku)
        log(f'loaded {min(start + CANDIDATE_LOAD_BATCH_SIZE, total)}/{total} candidate embeddings')

    cur.close()
    return order, titles, vectors


def rank_candidates(active_embeddings, order, vectors, top_n):
    matrix = np.vstack([vectors[sku] for sku in order])
    similarity = matrix @ active_embeddings.T  # (candidates, active)

    max_similarity = similarity.max(axis=1)
    top10 = np.partition(similarity, -min(10, similarity.shape[1]), axis=1)[
        :, -min(10, similarity.shape[1]):
    ]
    avg_top10 = top10.mean(axis=1)

    frequency = np.sum(similarity > FREQUENCY_THRESHOLD, axis=1).astype(np.float32)
    frequency_max = frequency.max() if frequency.size else 0
    frequency_score = (frequency / frequency_max) if frequency_max > 0 else np.zeros_like(frequency)

    final = (
        FINAL_SCORE_WEIGHTS['max_similarity'] * max_similarity
        + FINAL_SCORE_WEIGHTS['avg_top10'] * avg_top10
        + FINAL_SCORE_WEIGHTS['frequency'] * frequency_score
    )

    order_arr = np.array(order)
    idx = np.argsort(-final)[:top_n]
    return list(zip(order_arr[idx].tolist(), final[idx].tolist()))


def write_batch(conn, batch_id, ranked):
    import uuid
    cur = conn.cursor()
    now = datetime.utcnow()

    # 29-char PK matches the varchar(35) column and the entity's `airec_` +
    # 26-char ULID convention (uuid4 hex trimmed for consistent length).
    payload = [
        ('airec_' + uuid.uuid4().hex[:26], batch_id, sku, rank, score, now)
        for rank, (sku, score) in enumerate(ranked, start=1)
    ]

    for start in range(0, len(payload), DB_INSERT_BATCH_SIZE):
        chunk = payload[start:start + DB_INSERT_BATCH_SIZE]
        execute_values(
            cur,
            'INSERT INTO ai_recommended_active_audios '
            '(id, batch_id, sku, rank, ai_similarity_score, computed_at) VALUES %s',
            chunk,
        )

    cur.close()
    return len(payload)


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--batch-id', required=True)
    p.add_argument('--top-n', type=int, required=True)
    p.add_argument('--top-k-per-active', type=int, required=True)
    return p.parse_args()


def main():
    args = parse_args()
    if args.top_n < 1 or args.top_k_per_active < 1:
        raise ValueError('--top-n and --top-k-per-active must be positive')

    conn = db_connect()
    register_vector(conn)
    conn.autocommit = False

    verify_cur = conn.cursor()
    verify_setup(verify_cur)
    verify_cur.close()

    active_skus, active_embeddings = load_active_books(conn)

    candidate_seen: set[str] = set()
    ordered_candidates: list[str] = []

    for i, emb in enumerate(active_embeddings):
        for sku in get_similar_inactive(conn, emb, args.top_k_per_active):
            if sku not in candidate_seen:
                candidate_seen.add(sku)
                ordered_candidates.append(sku)
        if (i + 1) % PROGRESS_EVERY == 0:
            emit({
                'stage': 'ranking',
                'processed_active': i + 1,
                'total_active': len(active_skus),
            })

    log(f'candidate pool: {len(ordered_candidates)} distinct inactive books')
    if not ordered_candidates:
        raise RuntimeError('no candidate inactive books produced by nearest-neighbour search.')

    order, _titles, vectors = load_candidate_embeddings(conn, ordered_candidates)
    ranked = rank_candidates(active_embeddings, order, vectors, args.top_n)

    rows_written = write_batch(conn, args.batch_id, ranked)
    conn.commit()
    conn.close()

    emit({'done': True, 'rows': rows_written})


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        emit({'error': str(exc)})
        log(traceback.format_exc())
        sys.exit(1)
