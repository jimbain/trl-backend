import {
  BaseEntity,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { Category } from 'src/categories/entities/category.entity';
import { Audio } from './audio.entity';

@Entity({ name: 'audio_categories' })
export class AudioCategory extends BaseEntity {
  @Column()
  audio_id: string;

  @Column()
  category_id: string;

  @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audio_id' })
  audio: Audio;

  @ManyToOne(() => Category, (category) => category.id, { onDelete: 'CASCADE'})
  @JoinColumn({ name: 'category_id' })
  category: Category;
}
