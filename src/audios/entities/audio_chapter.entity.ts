import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulidx';
import { Audio } from './audio.entity';

@Entity({ name: 'audio_chapters' })
@Unique(['audio_id', 'part_id', 'chapter_id'])
export class AudioChapter extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column()
  audio_id: string;

  @Column({ type: 'int' })
  part_id: number;

  @Column({ type: 'int' })
  chapter_id: number;

  @Column({ type: 'int' })
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
