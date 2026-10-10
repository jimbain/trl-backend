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

  @Column({ type: 'jsonb', nullable: true })
  deep_link: Record<string, string>; // { "biz.therentallibrary.com": "https://trl.app.link/xxx", ... }

  @Column({ type: 'boolean', default: true })
  is_only_for_purchase: boolean;

  @Column({ type: 'boolean', default: false })
  is_new_trl: boolean;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  categories: string[]; // categories.id[]

  // varchar(250), not text: migration 1785 creates it that way and asserts the
  // type, and backfill.py's verify_column demands the same. Declaring `text`
  // here made migration:generate emit a spurious ALTER forever, and would have
  // widened the column — breaking both checks — the first time anyone ran with
  // POSTGRES_SYNCHRONIZE=true.
  @Column({ type: 'varchar', length: 250, nullable: true })
  ai_categories: string | null;

  @Column({ type: 'jsonb', nullable: false, default: [] })
  suggestions: string[]; // audios.id[]

  @Column({ type: 'bigint', default: 0 })
  total_played: number;

  @Column({ type: 'timestamp', nullable: true })
  activated_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  curated_at: Date;

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
