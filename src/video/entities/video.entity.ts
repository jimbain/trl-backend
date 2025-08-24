import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
  DeleteDateColumn,
} from 'typeorm';
import { VideoReview } from './video-review.entity';
import { VideoUserStatus } from './video-user-status.entity';
import { ulid } from 'ulidx';

@Entity('videos')
export class Video {
  @PrimaryColumn({ type: 'varchar', length: 34 })
  id: string;

  @Column({ type: 'varchar', nullable: true })
  group?: string;

  @Column({ type: 'varchar', unique: true })
  sku?: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  @Column({ type: 'varchar', nullable: true })
  image_url?: string;

  @Column({ type: 'varchar', nullable: true })
  runtime?: string;

  @Column({ type: 'float', default: 0 })
  avg_rating: number;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  categories: string[];

  @Column({ type: 'bigint', default: 0 })
  total_played: number;

  @Column({ type: 'varchar', nullable: true })
  avilar_course_id?: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'video_' + ulid();
  }

  @OneToMany(() => VideoReview, (review) => review.video)
  reviews: VideoReview[];

  @OneToMany(() => VideoUserStatus, (status) => status.video)
  userStatuses: VideoUserStatus[];
}
