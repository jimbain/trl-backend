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

export type AiRecommendationRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed';

export type AiRecommendationRunStage = 'embedding' | 'ranking' | 'done';

export type AiRecommendationRunTrigger = 'cron' | 'manual';

@Entity({ name: 'ai_recommendation_runs' })
@Index('idx_ai_reco_runs_started', ['started_at'])
@Index('idx_ai_reco_runs_status', ['status'])
export class AiRecommendationRun extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column({ type: 'uuid', unique: true })
  batch_id: string;

  @Column({ type: 'varchar', length: 20 })
  status: AiRecommendationRunStatus;

  @Column({ type: 'varchar', length: 20, nullable: true })
  stage: AiRecommendationRunStage | null;

  @Column({ type: 'varchar', length: 20 })
  triggered_by: AiRecommendationRunTrigger;

  @CreateDateColumn()
  started_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'int', nullable: true })
  rows_produced: number | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @BeforeInsert()
  generateUlid() {
    this.id = 'airun_' + ulid();
  }
}
