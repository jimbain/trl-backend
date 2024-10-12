import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulidx';
import { Audio } from './audio.entity';
import { User } from 'src/users/entities/user.entity';

@Entity({ name: 'audio_reviews' })
@Unique(['audio_id', 'user_id'])
export class AudioReview extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column()
  audio_id: string;

  @Column()
  user_id: string;

  @Column({ type: 'int' })
  rate: number;

  @Column({ type: 'text', nullable: true })
  review: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audio_id' })
  audio: Audio;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @BeforeInsert()
  generateUlid() {
    this.id = 'audio_review_' + ulid();
  }
}
