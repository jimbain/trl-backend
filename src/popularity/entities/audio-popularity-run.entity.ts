import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { ulid } from 'ulidx';

export type PopularityRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  /** Completed, but a configured source contributed nothing. */
  | 'partial'
  | 'failed';

export type PopularityRunStage = 'fetching' | 'writing' | 'done';

/**
 * Statuses that mean "this run finished and committed a batch".
 *
 * `partial` belongs here: it is a completed run that happens to have found a
 * dead source. Every "has popularity ever been computed?" check must accept
 * both, or the nightly scheduler never sees its own last run and re-triggers
 * on every tick.
 */
export const COMPLETED_RUN_STATUSES: PopularityRunStatus[] = [
  'success',
  'partial',
];

export type PopularityRunTrigger = 'cron' | 'manual';

@Entity({ name: 'audio_popularity_runs' })
@Index('idx_audio_popularity_runs_started', ['started_at'])
@Index('idx_audio_popularity_runs_status', ['status'])
export class AudioPopularityRun extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column({ type: 'uuid', unique: true })
  batch_id: string;

  @Column({ type: 'varchar', length: 20 })
  status: PopularityRunStatus;

  @Column({ type: 'varchar', length: 30, nullable: true })
  stage: PopularityRunStage | null;

  @Column({ type: 'varchar', length: 20 })
  triggered_by: PopularityRunTrigger;

  @CreateDateColumn()
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'int', nullable: true })
  audios_processed: number | null;

  @Column({ type: 'int', nullable: true })
  audios_matched: number | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  /**
   * Rows matched per source, e.g. `{ "openlibrary": 889 }`.
   *
   * Exists because Google Books matched nothing for 37 consecutive nights
   * while every run reported success. A per-source count makes a dead source
   * visible on the first run rather than whenever someone happens to look.
   */
  @Column({ type: 'jsonb', nullable: true })
  source_match_counts: Record<string, number> | null;

  @BeforeInsert()
  generateUlid() {
    if (!this.id) this.id = 'aprn_' + ulid();
  }
}
