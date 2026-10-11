import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Audio } from '../entities/audio.entity';
import { Company } from 'src/companies/entities/company.entity';
import { BranchService } from 'src/common/services/branch.service';
import { DomainHelper } from 'src/common/helpers/domain.helper';

export interface DeepLinkRunOptions {
  /** Restrict to these audio ids. Omitted = every active, non-deleted audio. */
  audioIds?: string[];
  /** Restrict generation to a single domain. */
  domainFilter?: string;
  batchSize?: number;
  batchDelayMs?: number;
  /** Receives human-readable progress; the CLI prints it, the cron logs it. */
  onProgress?: (message: string) => void;
}

export interface DeepLinkRunResult {
  domains: string[];
  found: number;
  processed: number;
  /** Rows whose link map actually changed and were written. */
  written: number;
  /** Rows already holding exactly these links — deliberately not written. */
  unchanged: number;
  /** Rows where every domain failed at the Branch API. */
  failed: number;
  durationMs: number;
  /** False when another run held the lock and this one did nothing. */
  ran: boolean;
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_BATCH_DELAY_MS = 2000;

/**
 * Cross-process single-flight. The nightly cron and a manual CLI run would
 * otherwise generate links for the same titles concurrently and burn Branch
 * quota twice.
 */
const ADVISORY_LOCK_KEY = 8471120250017;

/**
 * Generates Branch deep links for audios, one link per active company domain.
 *
 * Extracted from scripts/generate-deep-links.ts so the nightly scheduler and
 * the CLI share one implementation. The scheduler calling this directly also
 * means the nightly run costs no extra memory: it reuses the BranchService and
 * connection pool the API already holds, instead of booting a second Nest
 * context beside a process that is holding a multi-gigabyte FAISS index.
 */
@Injectable()
export class DeepLinkGeneratorService {
  private readonly logger = new Logger(DeepLinkGeneratorService.name);

  constructor(
    @InjectRepository(Audio)
    private readonly audioRepo: Repository<Audio>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly branchService: BranchService,
    private readonly dataSource: DataSource,
  ) {}

  async run(options: DeepLinkRunOptions = {}): Promise<DeepLinkRunResult> {
    const started = Date.now();
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const batchDelayMs = options.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS;
    const say = options.onProgress ?? ((m: string) => this.logger.log(m));

    const empty: DeepLinkRunResult = {
      domains: [],
      found: 0,
      processed: 0,
      written: 0,
      unchanged: 0,
      failed: 0,
      durationMs: 0,
      ran: false,
    };

    const [{ locked }] = await this.dataSource.query(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [ADVISORY_LOCK_KEY],
    );
    if (!locked) {
      say('another deep link run holds the lock — skipping this one');
      return { ...empty, durationMs: Date.now() - started };
    }

    try {
      const domains = await this.collectDomains(options.domainFilter);
      if (domains.length === 0) {
        say('no active company domains — nothing to generate');
        return { ...empty, durationMs: Date.now() - started };
      }
      say(`domains: ${domains.join(', ')}`);

      const audioIds = await this.selectAudioIds(options.audioIds);
      say(`${audioIds.length} audios to check`);

      let processed = 0;
      let written = 0;
      let unchanged = 0;
      let failed = 0;

      for (let i = 0; i < audioIds.length; i += batchSize) {
        const batch = audioIds.slice(i, i + batchSize);

        for (const id of batch) {
          try {
            const existing = await this.audioRepo.findOne({
              where: { id },
              select: ['id', 'deep_link'],
            });

            // Returns the merged map. For a title that already has every
            // domain it skips the Branch API entirely and hands back exactly
            // what was passed in.
            const links =
              await this.branchService.createOrUpdateDeepLinksForAudio(
                id,
                domains,
                existing?.deep_link,
              );

            if (Object.keys(links).length === 0) {
              this.logger.warn(`audio ${id}: all domains failed`);
              failed += 1;
            } else if (this.sameLinks(existing?.deep_link, links)) {
              // Writing an identical map is not free. A row update on audios
              // is non-HOT, so it is inserted into every index including the
              // multi-gigabyte HNSW graph, bumps updated_at (which makes the
              // FAISS delta re-stream the row) and leaves a dead tuple.
              unchanged += 1;
            } else {
              await this.audioRepo.update(id, { deep_link: links });
              written += 1;
            }
            processed += 1;
          } catch (err: any) {
            this.logger.error(`audio ${id}: ${err?.message ?? err}`);
            failed += 1;
            processed += 1;
          }
        }

        if (i + batchSize < audioIds.length) {
          say(
            `progress ${processed}/${audioIds.length} ` +
              `(${written} written, ${unchanged} already current, ${failed} failed)`,
          );
          // Paced so a full sweep cannot look like a burst to Branch.
          await new Promise((r) => setTimeout(r, batchDelayMs));
        }
      }

      return {
        domains,
        found: audioIds.length,
        processed,
        written,
        unchanged,
        failed,
        durationMs: Date.now() - started,
        ran: true,
      };
    } finally {
      await this.dataSource.query('SELECT pg_advisory_unlock($1)', [
        ADVISORY_LOCK_KEY,
      ]);
    }
  }

  /** Unique base domains across every active company. */
  private async collectDomains(filter?: string): Promise<string[]> {
    const companies = await this.companyRepo.find({
      where: { is_active: true },
      select: ['id', 'domain'],
    });

    // extractUniqueDomains returns a Set, and each company has one domain.
    const domains = DomainHelper.extractUniqueDomains(
      companies.map((c) => c.domain),
    );

    if (!filter) return Array.from(domains);

    // Normalised the same way the stored domains were, so a filter given as
    // a full URL still matches.
    const normalized = DomainHelper.extractBaseDomain(filter);
    if (!domains.has(normalized)) {
      this.logger.warn(
        `domain filter "${normalized}" is not among the active company ` +
          `domains (${Array.from(domains).join(', ')}) — nothing to do`,
      );
      return [];
    }
    return [normalized];
  }

  private async selectAudioIds(explicit?: string[]): Promise<string[]> {
    if (explicit?.length) {
      const rows = await this.audioRepo.find({
        where: { id: In(explicit) },
        select: ['id'],
      });
      return rows.map((r) => r.id);
    }

    const rows = await this.audioRepo
      .createQueryBuilder('audio')
      .select('audio.id')
      .where('audio.is_active = :active', { active: true })
      .andWhere('audio.deleted_at IS NULL')
      .orderBy('audio.created_at', 'DESC')
      .getRawMany();

    return rows.map((r) => r.audio_id);
  }

  /** Key-order-independent comparison of two flat domain -> url maps. */
  private sameLinks(
    a: Record<string, string> | null | undefined,
    b: Record<string, string>,
  ): boolean {
    if (!a) return false;
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length) return false;
    return ka.every((k, i) => kb[i] === k && a[k] === b[k]);
  }
}
