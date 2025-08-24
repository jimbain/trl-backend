import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
} from 'typeorm';
import { Video } from './video.entity';
import { MediaStatus, USER_MEDIA_STATUS } from 'src/constants';
import { User } from 'src/users/entities/user.entity';
import { ulid } from 'ulidx';

@Entity('video_user_statuses')
export class VideoUserStatus {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column({ type: 'varchar' })
  video_id: string;

  @Column({ type: 'varchar' })
  user_id: string;

  @Column({
    type: 'enum',
    enum: USER_MEDIA_STATUS,
    default: USER_MEDIA_STATUS.QUEUED,
  })
  status: MediaStatus;

  @Column({ type: 'timestamp', nullable: true })
  rental_start_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  current_rental_expire_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  next_rental_expire_at?: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'video_user_status_' + ulid();
  }

  @ManyToOne(() => Video, (video) => video.userStatuses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'video_id' })
  video: Video;

  @ManyToOne(() => User, (user) => user.videoUserStatuses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
