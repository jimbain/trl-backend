"""Long-running FAISS recommender driven over stdin/stdout (NDJSON).

Loads the BGE sentence-transformer once, pulls `(sku, ai_embedding)` rows from
Postgres once, builds an in-memory FAISS HNSW index, then serves recommendation
requests forever.

The built FAISS index + SKU list is persisted to disk so subsequent restarts
skip the multi-hour rebuild. On startup, if a persisted index exists, it is
loaded and any rows added since the snapshot are streamed in and appended
(delta ingest). A `refresh` command performs the same delta ingest at runtime
without a restart.

Wire protocol (one JSON object per line):
- On startup, emits: {"ready": true, "indexed": N}
                  or {"ready": false, "error": "..."} on failure.
- Recommend:  {"id": "<uuid>", "prompt": "<text>", "limit": <int>}
  Response:   {"id": "<uuid>", "results": [{"sku": "...", "score": 0.83}, ...]}
- Refresh:    {"id": "<uuid>", "command": "refresh"}
  Response:   {"id": "<uuid>", "added": <int>, "indexed": <int>}
- Errors:     {"id": "<uuid>", "error": "..."}

Environment variables:
  DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE
                       - matches NestJS data_source
  POSTGRES_SSL=true    - enable SSL with ca cert at /app/cert/db-ca-certificate.crt
  AI_RECO_INDEX_DIR    - directory where the persisted FAISS index is stored
                         (default: /app/data/ai-reco). Mount a persistent
                         volume here so restarts skip the rebuild.
"""

import json
import os
import sys
import traceback
from datetime import datetime

import faiss
import numpy as np
import psycopg2
from sentence_transformers import SentenceTransformer

MODEL_NAME = 'BAAI/bge-base-en-v1.5'
SSL_CA_PATH = 'cert/db-ca-certificate.crt'
INDEX_DIR_DEFAULT = '/app/data/ai-reco'
FETCH_BATCH_SIZE = 1000


# --- IO helpers --------------------------------------------------------------

def emit(payload):
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


def log(msg):
    sys.stderr.write(f'[recommender.py] {msg}\n')
    sys.stderr.flush()


# --- DB helpers --------------------------------------------------------------

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


def parse_embedding(raw):
    """Coerce a row's ai_embedding value to a 1-D float32 numpy vector, or None."""
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return None
    try:
        vec = np.asarray(raw, dtype='float32')
    except Exception:
        return None
    if vec.ndim != 1 or vec.size == 0:
        return None
    return vec


# --- Persistence -------------------------------------------------------------

def index_paths():
    base = os.environ.get('AI_RECO_INDEX_DIR', INDEX_DIR_DEFAULT)
    return {
        'dir': base,
        'index': os.path.join(base, 'faiss.index'),
        'skus': os.path.join(base, 'skus.json'),
        'meta': os.path.join(base, 'meta.json'),
    }


def load_persisted():
    """Return (skus, index, meta) if a persisted index is present, else None."""
    paths = index_paths()
    if not all(os.path.exists(paths[k]) for k in ('index', 'skus', 'meta')):
        return None
    try:
        log(f'loading persisted FAISS index from {paths["index"]}')
        index = faiss.read_index(paths['index'])
        with open(paths['skus']) as f:
            skus = json.load(f)
        with open(paths['meta']) as f:
            meta = json.load(f)
        if meta.get('model_name') != MODEL_NAME:
            log(
                f'persisted index built with different model '
                f'({meta.get("model_name")} vs {MODEL_NAME}) — discarding'
            )
            return None
        log(f'loaded persisted index ({len(skus)} vectors)')
        return skus, index, meta
    except Exception as e:
        log(f'failed to load persisted index: {e}; will rebuild')
        return None


def save_persisted(skus, index, max_updated_at_iso):
    paths = index_paths()
    os.makedirs(paths['dir'], exist_ok=True)
    log(f'saving FAISS index to {paths["index"]}')
    faiss.write_index(index, paths['index'])
    with open(paths['skus'], 'w') as f:
        json.dump(skus, f)
    with open(paths['meta'], 'w') as f:
        json.dump({
            'row_count': len(skus),
            'max_updated_at': max_updated_at_iso,
            'model_name': MODEL_NAME,
            'saved_at': datetime.utcnow().isoformat() + 'Z',
        }, f)
    log('persisted index saved')


# --- Index construction ------------------------------------------------------

def build_empty_index(dimension):
    index = faiss.IndexHNSWFlat(dimension, 32, faiss.METRIC_INNER_PRODUCT)
    index.hnsw.efConstruction = 200
    return index


def add_to_index(index, matrix):
    """Normalize + add a batch of vectors to the index."""
    matrix = matrix.astype('float32').copy()
    faiss.normalize_L2(matrix)
    index.add(matrix)


def stream_rows(since_iso=None):
    """Yield (sku, vector, updated_at) tuples from postgres, optionally after a timestamp.

    Only English-language audios are included so the FAISS index stays
    language-consistent with the BGE English model. Non-English titles returned
    bad results when English corporate prompts were used.
    """
    conn = db_connect()
    try:
        with conn.cursor(name='ai_reco_fetch') as cur:
            cur.itersize = FETCH_BATCH_SIZE
            if since_iso:
                log(f'streaming rows with updated_at > {since_iso}')
                cur.execute(
                    'SELECT a.sku, a.ai_embedding, a.updated_at '
                    'FROM audios a '
                    'JOIN audio_metadata m ON m.sku = a.sku '
                    'WHERE a.ai_embedding IS NOT NULL AND a.deleted_at IS NULL '
                    '  AND m.language ILIKE \'%english%\' '
                    '  AND a.updated_at > %s '
                    'ORDER BY a.updated_at ASC',
                    (since_iso,),
                )
            else:
                log('streaming all eligible rows (English only)')
                cur.execute(
                    'SELECT a.sku, a.ai_embedding, a.updated_at '
                    'FROM audios a '
                    'JOIN audio_metadata m ON m.sku = a.sku '
                    'WHERE a.ai_embedding IS NOT NULL AND a.deleted_at IS NULL '
                    '  AND m.language ILIKE \'%english%\' '
                    'ORDER BY a.updated_at ASC'
                )
            for sku, embedding, updated_at in cur:
                vec = parse_embedding(embedding)
                if vec is None:
                    continue
                yield sku, vec, updated_at
    finally:
        conn.close()


FULL_BUILD_BATCH_SIZE = 10000


def full_build():
    """Stream rows and build the HNSW index in batches.

    Vectors are added to the index in fixed-size batches so peak RAM stays
    bounded — accumulating the full matrix and np.stack-ing it allocates a
    duplicate copy that OOMs on multi-hundred-thousand-row datasets.

    A seen-SKU set guards against the same audio being indexed twice if the
    underlying cursor ever yields it more than once (e.g. concurrent updates
    shifting updated_at during a long-running fetch). The resulting HNSW
    graph is bit-identical to the previous all-at-once build because FAISS
    inserts vectors sequentially within each add() call and the DB stream
    order (updated_at ASC) is preserved.
    """
    skus = []
    sku_set = set()
    streamed = 0
    skipped = 0
    max_updated_at = None
    index = None
    batch = []

    def flush():
        nonlocal index
        if not batch:
            return
        matrix = np.stack(batch)
        if index is None:
            index = build_empty_index(matrix.shape[1])
        add_to_index(index, matrix)
        batch.clear()

    for sku, vec, updated_at in stream_rows():
        streamed += 1
        if sku in sku_set:
            skipped += 1
            continue
        sku_set.add(sku)
        skus.append(sku)
        batch.append(vec)
        if updated_at is not None and (
            max_updated_at is None or updated_at > max_updated_at
        ):
            max_updated_at = updated_at
        if len(batch) >= FULL_BUILD_BATCH_SIZE:
            flush()
        if streamed % 5000 == 0:
            log(f'streamed {streamed} rows ({skipped} duplicates skipped)...')

    flush()
    log(
        f'streamed {streamed} rows total ({skipped} duplicates skipped); '
        f'index built with {len(skus)} vectors'
    )
    if index is None:
        return skus, None, None
    return skus, index, _iso(max_updated_at)


def ingest_delta(skus, index, since_iso):
    """Append rows added/updated after `since_iso`. Returns (added_count, new_max_iso)."""
    sku_set = set(skus)
    new_vectors = []
    new_skus = []
    new_max = since_iso
    streamed = 0
    for sku, vec, updated_at in stream_rows(since_iso=since_iso):
        streamed += 1
        ts_iso = _iso(updated_at)
        if ts_iso and (new_max is None or ts_iso > new_max):
            new_max = ts_iso
        if sku in sku_set:
            # Existing sku with a newer updated_at. The original vector stays in
            # the index; rebuild the cache (delete the data dir) if you've
            # changed the embedding model or need a strict replacement.
            continue
        sku_set.add(sku)
        new_skus.append(sku)
        new_vectors.append(vec)
        if streamed % 5000 == 0:
            log(f'delta streamed {streamed} rows...')

    if not new_vectors:
        return 0, new_max

    matrix = np.stack(new_vectors)
    add_to_index(index, matrix)
    skus.extend(new_skus)
    return len(new_vectors), new_max


def _iso(value):
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return value.isoformat()


# --- Request handling --------------------------------------------------------

def recommend(model, index, skus, prompt, limit):
    user_embedding = model.encode([prompt]).astype('float32')
    faiss.normalize_L2(user_embedding)

    index.hnsw.efSearch = max(50, limit * 4)
    capped = min(limit, len(skus))
    scores, indices = index.search(user_embedding, capped)

    results = []
    for i, idx in enumerate(indices[0]):
        if idx < 0 or idx >= len(skus):
            continue
        results.append({'sku': skus[idx], 'score': float(scores[0][i])})
    return results


# --- Main loop ---------------------------------------------------------------

def main():
    state = {'skus': None, 'index': None, 'max_updated_at': None}

    try:
        log(f'loading model {MODEL_NAME}')
        model = SentenceTransformer(MODEL_NAME)

        loaded = load_persisted()
        if loaded is not None:
            skus, index, meta = loaded
            state['skus'] = skus
            state['index'] = index
            state['max_updated_at'] = meta.get('max_updated_at')
            log('checking for new rows since last snapshot')
            added, new_max = ingest_delta(skus, index, state['max_updated_at'])
            if added > 0:
                log(f'ingested {added} new rows since snapshot')
                state['max_updated_at'] = new_max
                save_persisted(skus, index, new_max)
            else:
                log('no new rows since snapshot')
        else:
            log('no persisted index — running full build')
            skus, index, max_updated_at = full_build()
            if index is None:
                emit({'ready': False, 'error': 'no embeddings found in audios.ai_embedding'})
                return
            state['skus'] = skus
            state['index'] = index
            state['max_updated_at'] = max_updated_at
            save_persisted(skus, index, max_updated_at)
    except Exception as e:
        log(f'startup failed: {e}\n{traceback.format_exc()}')
        emit({'ready': False, 'error': str(e)})
        return

    emit({'ready': True, 'indexed': len(state['skus'])})
    log('ready')

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get('id')

            if req.get('command') == 'refresh':
                added, new_max = ingest_delta(
                    state['skus'], state['index'], state['max_updated_at']
                )
                if added > 0:
                    state['max_updated_at'] = new_max
                    save_persisted(state['skus'], state['index'], new_max)
                emit({
                    'id': req_id,
                    'added': added,
                    'indexed': len(state['skus']),
                })
                continue

            prompt = req['prompt']
            limit = int(req['limit'])
            results = recommend(
                model, state['index'], state['skus'], prompt, limit
            )
            emit({'id': req_id, 'results': results})
        except Exception as e:
            log(f'request failed: {e}\n{traceback.format_exc()}')
            emit({'id': req_id, 'error': str(e)})


if __name__ == '__main__':
    main()
