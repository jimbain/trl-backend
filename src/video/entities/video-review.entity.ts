import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import { Video } from './video.entity';
import { User } from 'src/users/entities/user.entity';
import { ulid } from 'ulidx';

@Entity('video_reviews')
export class VideoReview {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column({ type: 'varchar' })
  video_id: string;

  @Column({ type: 'varchar' })
  user_id: string;

  @Column({ type: 'int' })
  rate: number;

  @Column({ type: 'text', nullable: true })
  review?: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'video_review_' + ulid();
  }

  @ManyToOne(() => Video, (video) => video.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_id' })
  video: Video;

  @ManyToOne(() => User, (user) => user.videoReviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
