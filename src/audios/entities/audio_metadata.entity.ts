import { MEDIA_AVAILABILITY_TYPE, MediaAvailabilityType } from 'src/constants';
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'audio_metadata' })
export class AudioMetadata extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', nullable: false })
  sku: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'jsonb', default: [] })
  authors: string[];

  @Column({ type: 'varchar', nullable: true })
  isbn: string;

  @Column({ type: 'varchar', nullable: true })
  publisher: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', nullable: true })
  language: string;

  @Column({ type: 'int', default: 0 })
  actual_size: number;

  @Column({ type: 'jsonb', default: [] })
  narrators: string[];

  @Column({ type: 'varchar', nullable: true })
  abridgement: string;

  @Column({ type: 'jsonb', nullable: true })
  bisac_codes: string[];

  @Column({ type: 'varchar', nullable: true })
  runtime: string;

  @Column({ type: 'varchar', nullable: true })
  product_id: string; // library.id

  @Column({ type: 'varchar', nullable: true })
  retail_product_id: string; // retail.id

  @Column({ type: 'varchar', nullable: true })
  metadata_signature: string;

  @Column({ type: 'float', nullable: true })
  findaway_price: number; // library.list_price

  @Column({ type: 'float', nullable: true })
  findaway_content_cost: number; // library.content_cost

  @Column({ type: 'float', nullable: true })
  findaway_retail_price: number; // retail.list_price

  @Column({ type: 'float', nullable: true })
  findaway_retail_content_cost: number; // retail.content_cost

  @Column({
    type: 'enum',
    enum: Object.values(MEDIA_AVAILABILITY_TYPE),
    default: MEDIA_AVAILABILITY_TYPE.BOTH,
  })
  available_for: MediaAvailabilityType;

  @Column({ type: 'date', nullable: true })
  street_date: Date | null;

  @Column({ type: 'boolean', nullable: true })
  is_for_sale: boolean; // active_products != empty

  @Column({ type: 'jsonb', nullable: true })
  sales_locations: string[];

  @Column({ type: 'jsonb', nullable: true })
  retail_sales_locations: string[];

  @Column({ type: 'varchar', nullable: true })
  copyright: string;

  @Column({ type: 'text', nullable: true })
  sample_url: string;

  @Column({ type: 'text', nullable: true })
  cover_url: string;

  @Column({ type: 'text', nullable: true })
  sub_title: string;

  @Column({ type: 'jsonb', nullable: false, default: [] })
  chapters: AudioChapter[];

  @Column({ type: 'int', default: 0 })
  purchased_rental_licenses: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;
}

interface AudioChapter {
  part_number: number;
  chapter_number: number;
  duration: number;
}
