import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

@Entity({ name: 'audios' })
export class Audio extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column()
  sku: string;

  @Column({
    type: 'enum',
    enum: ['rent', 'bookshelf', 'both'],
    default: 'both',
  })
  available_for: 'rent' | 'bookshelf' | 'both';

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_excluded: boolean;

  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  @Column({ type: 'boolean', default: false })
  is_only_for_purchase: boolean;

  @Column({ type: 'int', default: 0 })
  trl_cost: number;

  @Column({ type: 'varchar', length: 255 })
  display_title: string;

  @Column({ type: 'jsonb', nullable: true })
  display_authors: string[];

  @Column({ type: 'text', nullable: true })
  display_description: string;

  @Column({ type: 'text', nullable: true })
  display_short_description: string;

  @Column({ type: 'varchar', nullable: true })
  display_copyright: string;

  @Column({ type: 'text', nullable: true })
  image_url: string;

  @Column({ type: 'int', default: 0 })
  purchased_licenses: number;

  @Column({ type: 'int', default: 0 })
  purchased_license_limit: number;

  @Column({ type: 'int', default: 0 })
  rent_counter: number;

  @Column({ type: 'float', default: 0 })
  avg_rating: number;

  @Column({ type: 'text', nullable: true })
  deep_link: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'audio_' + ulid();
  }
}
