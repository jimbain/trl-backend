import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  BeforeInsert,
  Unique,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { ulid } from 'ulidx';
import { MediaStatus, USER_MEDIA_STATUS } from 'src/constants';

@Entity({ name: 'user_audio_statuses' })
@Unique(['audio_id', 'user_id'])
export class UserAudioStatus extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  id: string;

  @Column()
  user_id: string;

  @Column()
  audio_id: string;

  @Column({
    type: 'enum',
    enum: Object.values(USER_MEDIA_STATUS),
    default: USER_MEDIA_STATUS.QUEUED,
  })
  status: MediaStatus;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;

  @Column({ type: 'timestamp', nullable: true, comment: 'Only for Rent' })
  rental_expire_at: Date;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audio_id' })
  audio: Audio;

  @BeforeInsert()
  generateUlid() {
    this.id = 'user_audio_status_' + ulid();
  }
}
