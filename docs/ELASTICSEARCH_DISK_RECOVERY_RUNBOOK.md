# Elasticsearch Disk Recovery — Runbook

Move Elasticsearch's data and logs directories off the root volume onto a larger mounted volume, then clear the read-only-allow-delete block and re-sync stale documents.

Use this runbook when Elasticsearch has tripped the flood-stage disk watermark and writes are being rejected with `cluster_block_exception: index [...] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark, index has read-only-allow-delete block]`.

---

## When this applies

- Symptom in app logs: `Failed to sync audio ID ...` followed by `ResponseError: cluster_block_exception`.
- Symptom in ES: writes return `cluster_block_exception`, the index has `index.blocks.read_only_allow_delete: true`.
- Root cause: the disk holding `path.data` has crossed the flood-stage watermark (default 95%). ES sets a read-only block that does **not** auto-clear when disk frees up — it must be cleared manually.

## Prerequisites

- SSH access to the Elasticsearch host as a user that can `sudo`.
- A mounted volume with significantly more free space than the current `path.data` directory size. In the dev incident this was `/mnt/trl_dev_backend_volume`. Replace this path everywhere with the production volume's mount point.
- ES superuser credentials. Replace `<ES_PASSWORD>` everywhere with the value of `ELASTICSEARCH_PASSWORD` from the server's `.env`.
- The application can tolerate ES being offline for a few minutes (rent / admin updates will return 200 but ES will silently stay stale during the outage — same as the original incident).
- A change window if production. Announce the brief downtime.

## Important

- **Do not** copy a live Elasticsearch data directory. Stop the service before rsync (Step 4). Copying hot data will corrupt indices.
- **Do not** delete the original data directory (`/var/lib/elasticsearch`) until ES has started successfully from the new path and you have verified data integrity (Step 12).
- All curl commands assume self-signed TLS — `-k` is intentional. If production uses a real cert, drop `-k`.

---

## Step 0 — Capture baseline

```bash
df -h /
sudo du -sh /var/lib/elasticsearch /var/log/elasticsearch /var/log /var/cache/apt /var/lib/docker /home /root /tmp 2>/dev/null | sort -h
sudo journalctl --disk-usage
```

Save the output. Useful for post-incident notes and for sizing the new volume.

## Step 1 — Quick disk wins (safe, recovers ~2.5 GB typically)

```bash
sudo journalctl --vacuum-size=200M
sudo apt-get clean
df -h /
```

This alone usually drops disk usage below the flood-stage watermark and lets ES accept writes again as soon as Step 10 runs. The full volume move is still the permanent fix.

## Step 2 — Confirm current ES paths

```bash
grep -E '^path\.(data|logs)' /etc/elasticsearch/elasticsearch.yml
```

Expect either nothing (defaults apply) or `/var/lib/elasticsearch` and `/var/log/elasticsearch`. If production uses different paths, substitute them into every step below.

## Step 3 — Prepare new location on the volume

Replace `/mnt/trl_dev_backend_volume` with the production volume mount point.

```bash
sudo mkdir -p /mnt/trl_dev_backend_volume/elasticsearch/data
sudo mkdir -p /mnt/trl_dev_backend_volume/elasticsearch/logs
sudo chown -R elasticsearch:elasticsearch /mnt/trl_dev_backend_volume/elasticsearch
sudo chmod 750 /mnt/trl_dev_backend_volume/elasticsearch/data /mnt/trl_dev_backend_volume/elasticsearch/logs
```

## Step 4 — Stop Elasticsearch (mandatory)

```bash
sudo systemctl stop elasticsearch
sudo systemctl status elasticsearch | head -5
```

Wait until you see `Active: inactive (dead)` before continuing. Skipping this risks index corruption.

## Step 5 — Copy data + logs to the volume

```bash
sudo rsync -aHAX --info=progress2 /var/lib/elasticsearch/ /mnt/trl_dev_backend_volume/elasticsearch/data/
sudo rsync -aHAX --info=progress2 /var/log/elasticsearch/  /mnt/trl_dev_backend_volume/elasticsearch/logs/
sudo chown -R elasticsearch:elasticsearch /mnt/trl_dev_backend_volume/elasticsearch
```

Verify byte-for-byte size match:

```bash
sudo du -sh /var/lib/elasticsearch /mnt/trl_dev_backend_volume/elasticsearch/data
sudo du -sh /var/log/elasticsearch /mnt/trl_dev_backend_volume/elasticsearch/logs
```

Both pairs must match. Do **not** delete originals yet.

## Step 6 — Point ES at the new paths

Edit `/etc/elasticsearch/elasticsearch.yml`:

```bash
sudo nano /etc/elasticsearch/elasticsearch.yml
```

Replace or add — only one of each line:

```yaml
path.data: /mnt/trl_dev_backend_volume/elasticsearch/data
path.logs: /mnt/trl_dev_backend_volume/elasticsearch/logs
```

## Step 7 — Allow systemd to write to the new path

The Elasticsearch .deb unit file restricts writes to `/var/lib/elasticsearch` and `/var/log/elasticsearch` via `ReadWritePaths`. Add the new path as a systemd override:

```bash
sudo systemctl edit elasticsearch
```

In the editor, paste exactly:

```ini
[Service]
ReadWritePaths=/mnt/trl_dev_backend_volume/elasticsearch
```

Save, exit, reload:

```bash
sudo systemctl daemon-reload
```

## Step 8 — Start ES and watch for errors

```bash
sudo systemctl start elasticsearch
sudo journalctl -u elasticsearch -f --since "1 minute ago"
```

Wait for log lines indicating successful startup (`started`, `recovered [N] indices into cluster_state`). Ctrl+C to exit the tail.

If you see `failed to obtain node locks`, `AccessDeniedException`, or permission errors — **stop here**. Do not proceed. Verify Step 3 chown and Step 7 ReadWritePaths first.

## Step 9 — Verify ES is healthy and using the new path

```bash
curl -k -u 'elastic:<ES_PASSWORD>' 'https://localhost:9200/_cat/health?v'
curl -k -u 'elastic:<ES_PASSWORD>' 'https://localhost:9200/_cat/allocation?v'
curl -k -u 'elastic:<ES_PASSWORD>' 'https://localhost:9200/_cat/indices/es_audios?v'
```

`_cat/allocation` must show the new `/mnt/...` path and the volume's free space. `_cat/health` should be `green` or `yellow` (single-node clusters are normally `yellow` because replicas can't be assigned — that's fine).

## Step 10 — Clear the read-only-allow-delete block

This must be done explicitly. ES does not auto-clear the block when disk frees.

```bash
curl -k -u 'elastic:<ES_PASSWORD>' \
  -H 'Content-Type: application/json' \
  -X PUT 'https://localhost:9200/_all/_settings' \
  -d '{ "index.blocks.read_only_allow_delete": null }'
```

Confirm the block is gone (should return nothing):

```bash
curl -k -u 'elastic:<ES_PASSWORD>' \
  'https://localhost:9200/es_audios/_settings?pretty' | grep -i read_only
```

## Step 11 — Re-sync stale documents

While the block was active, every rent / admin-update / return / renew called `syncAudioById`, the ES write was rejected, and the error was swallowed at `src/audios/audio-elasticsearch-sync.service.ts:812-814`. The database is correct; ES is behind.

To re-sync a single audio, hit the admin update endpoint with a no-op body — it calls `syncAudioById` at the end:

```
PATCH /admin/audios/<audio_id>
Body: {}
```

Verify:

```bash
curl -k -u 'elastic:<ES_PASSWORD>' \
  'https://localhost:9200/es_audios/_doc/<audio_id>?_source=total_rented'
```

For a full re-sync of all audios, trigger the bulk sync entry point in `AudioElasticsearchSyncService` (the existing job that rebuilds the index). On the dev incident this was not needed — only the documents touched while the block was active need re-sync.

To find candidates that may be stale, compare Postgres against ES for the period the block was active. Example query against Postgres:

```sql
SELECT id, sku, total_rented
FROM audios
WHERE updated_at >= '<block_start_timestamp>';
```

Spot-check a few in ES; if any differ, run a bulk re-sync.

## Step 12 — Reclaim root disk (only after Step 11 passes)

Final sanity-check the old paths still match the new ones, then remove the old paths:

```bash
sudo du -sh /var/lib/elasticsearch /mnt/trl_dev_backend_volume/elasticsearch/data
sudo rm -rf /var/lib/elasticsearch /var/log/elasticsearch
df -h /
```

Root should drop significantly. On the dev incident, root went from 98% to ~70%.

---

## Verification checklist

- `df -h /` shows healthy free space on root.
- `curl /_cat/allocation` shows the volume path and the new free space.
- `curl /_cat/health` shows the cluster up.
- A test write (rent action or admin update) updates the ES doc immediately.
- App logs no longer contain `Failed to sync audio ID` / `cluster_block_exception`.

## Rollback (if Steps 5–9 go wrong)

If ES fails to start from the new path:

1. Stop ES: `sudo systemctl stop elasticsearch`
2. Revert `path.data` and `path.logs` in `/etc/elasticsearch/elasticsearch.yml` to the originals.
3. Remove the systemd override added in Step 7: `sudo systemctl revert elasticsearch && sudo systemctl daemon-reload`
4. Start ES: `sudo systemctl start elasticsearch`

The original data directory is untouched until Step 12, so rollback is safe.

## Why this happened — and what to fix separately

1. **Silent ES sync failure** — `syncAudioById` at `src/audios/audio-elasticsearch-sync.service.ts:812-814` catches and logs every error but does not re-throw or emit a metric. The application returned 200 on rent / admin update while ES silently fell behind. Worth bubbling the failure (or emitting an alert metric) in a separate, targeted change so the next watermark trip pages on-call instead of going unnoticed.

2. **No disk-usage alert on the ES host** — the volume crossed 95% with no warning. Add a basic disk-utilization alert (Prometheus node_exporter or your monitoring stack) at 80% / 90% / 95% thresholds.

3. **Watermark tuning is a workaround, not a fix** — raising the watermarks gives a little headroom but does not address the underlying disk-growth problem. Prefer adding disk or moving data (this runbook) over raising watermarks. Watermark settings, for reference only:

   ```bash
   curl -k -u 'elastic:<ES_PASSWORD>' \
     -H 'Content-Type: application/json' \
     -X PUT 'https://localhost:9200/_cluster/settings' \
     -d '{
       "persistent": {
         "cluster.routing.allocation.disk.watermark.low":         "85%",
         "cluster.routing.allocation.disk.watermark.high":        "90%",
         "cluster.routing.allocation.disk.watermark.flood_stage": "95%"
       }
     }'
   ```
