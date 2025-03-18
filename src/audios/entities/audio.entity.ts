import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulidx';
import { AudioMetadata } from './audio_metadata.entity';

@Entity({ name: 'audios' })
export class Audio extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column()
  sku: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_excluded: boolean;

  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  @Column({ type: 'int', default: 0 })
  bookshelf_credit_cost: number;

  @Column({ type: 'varchar', nullable: true })
  display_title: string;

  @Column({ type: 'jsonb', nullable: true })
  display_authors: string[];

  @Column({ type: 'text', nullable: true })
  display_description: string;

  @Column({ type: 'text', nullable: true })
  display_short_description: string;

  @Column({ type: 'varchar', nullable: true })
  display_copyright: string;

  @Column({ type: 'int', default: 0 })
  purchased_rental_license_limit: number;

  @Column({ type: 'int', default: 0 })
  total_rented: number;

  @Column({ type: 'float', default: 0 })
  avg_rating: number;

  @Column({ type: 'text', nullable: true })
  deep_link: string;

  @Column({ type: 'boolean', default: true })
  is_only_for_purchase: boolean;

  @Column({ type: 'boolean', default: false })
  is_new_trl: boolean;

  @Column({ type: 'boolean', default: false })
  is_curated: boolean;

  @Column({ type: 'jsonb', nullable: false, default: [] })
  categories: string[]; // categories.id[]

  @Column({ type: 'jsonb', nullable: false, default: [] })
  suggestions: string[]; // audios.id[]

  @Column({ type: 'bigint', default: 0 })
  total_played: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @OneToOne(() => AudioMetadata)
  @JoinColumn({ name: 'sku', referencedColumnName: 'sku' })
  metadata: AudioMetadata;

  @BeforeInsert()
  generateUlid() {
    this.id = 'audio_' + ulid();
  }
}
