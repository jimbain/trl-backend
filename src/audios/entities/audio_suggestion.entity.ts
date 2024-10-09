import {
  BaseEntity,
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { Audio } from './audio.entity';

@Entity({ name: 'audio_suggestions' })
export class AudioSuggestion extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column()
  audio_id: string;

  @Column()
  suggested_audio_id: string;

  @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audio_id' })
  audio: Audio;

  @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'suggested_audio_id' })
  suggested_audio: Audio;

  @BeforeInsert()
  generateUlid() {
    this.id = 'audio_suggestion_' + ulid();
  }
}
