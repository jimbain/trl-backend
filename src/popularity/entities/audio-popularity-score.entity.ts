import {
  BaseEntity,
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulidx';

export interface PopularitySourceBreakdown {
  [source: string]: {
    matched: boolean;
    sub_score: number | null; // 0-100 when matched, null when not
    weight: number;
    raw?: Record<string, unknown>; // small, human-inspectable evidence blob
  };
}

@Entity({ name: 'audio_popularity_scores' })
@Index('idx_audio_popularity_scores_score', ['popularity_score'])
@Index('idx_audio_popularity_scores_confidence', ['confidence'])
export class AudioPopularityScore extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column({ type: 'varchar', unique: true })
  sku: string;

  @Column({ type: 'smallint' })
  popularity_score: number;

  @Column({ type: 'smallint' })
  confidence: number;

  @Column({ type: 'jsonb', default: {} })
  sources: PopularitySourceBreakdown;

  @Column({ type: 'varchar', length: 64 })
  source_weights_version: string;

  @UpdateDateColumn()
  computed_at: Date;

  @BeforeInsert()
  generateUlid() {
    if (!this.id) this.id = 'apop_' + ulid();
  }
}
