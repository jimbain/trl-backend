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

export type PopularityRunStatus = 'pending' | 'running' | 'success' | 'failed';

export type PopularityRunStage = 'fetching' | 'writing' | 'done';

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

  @BeforeInsert()
  generateUlid() {
    if (!this.id) this.id = 'aprn_' + ulid();
  }
}
