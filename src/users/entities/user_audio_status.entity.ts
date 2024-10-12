import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryColumn,
  BeforeInsert,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { ulid } from 'ulidx';

@Entity({ name: 'user_audio_statuses' })
export class UserAudioStatus extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @PrimaryColumn()
  user_id: string;

  @PrimaryColumn()
  audio_id: string;

  @Column({
    type: 'enum',
    enum: ['queued', 'rented', 'bookshelved'],
    default: 'queued',
  })
  status: 'queued' | 'rented' | 'bookshelved';

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
