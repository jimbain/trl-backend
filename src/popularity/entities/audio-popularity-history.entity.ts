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
import { PopularitySourceBreakdown } from './audio-popularity-score.entity';

@Entity({ name: 'audio_popularity_history' })
@Index('idx_audio_popularity_history_sku_computed', ['sku', 'computed_at'])
@Index('idx_audio_popularity_history_batch', ['batch_id'])
export class AudioPopularityHistory extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column({ type: 'varchar' })
  sku: string;

  @Column({ type: 'uuid' })
  batch_id: string;

  @Column({ type: 'smallint', nullable: true })
  // NULL = no source could measure this title. Distinct from 0,
  // which means a source matched and reported nothing notable.
  popularity_score: number | null;

  @Column({ type: 'smallint' })
  confidence: number;

  @Column({ type: 'jsonb', default: {} })
  sources: PopularitySourceBreakdown;

  @Column({ type: 'varchar', length: 64 })
  source_weights_version: string;

  @CreateDateColumn()
  computed_at: Date;

  @BeforeInsert()
  generateUlid() {
    if (!this.id) this.id = 'aphi_' + ulid();
  }
}
