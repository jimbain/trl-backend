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

@Entity({ name: 'ai_recommended_active_audios' })
@Index('idx_ai_reco_batch_rank', ['batch_id', 'rank'])
@Index('idx_ai_reco_sku', ['sku'])
@Index('idx_ai_reco_computed_at', ['computed_at'])
export class AiRecommendedActiveAudio extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column({ type: 'uuid' })
  batch_id: string;

  @Column({ type: 'varchar' })
  sku: string;

  @Column({ type: 'int' })
  rank: number;

  @Column({ type: 'double precision' })
  ai_similarity_score: number;

  @CreateDateColumn()
  computed_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'airec_' + ulid();
  }
}
