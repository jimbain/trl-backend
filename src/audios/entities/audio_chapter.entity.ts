import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { Audio } from './audio.entity';

@Entity({ name: 'audio_chapters' })
export class AudioChapter extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column()
  audio_id: string;

  @Column({ type: 'int', nullable: true })
  chapter_id: number;

  @Column({ type: 'int', nullable: true })
  duration: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audio_id' })
  audio: Audio;

  @BeforeInsert()
  generateUlid() {
    this.id = 'audio_chapter_' + ulid();
  }
}
