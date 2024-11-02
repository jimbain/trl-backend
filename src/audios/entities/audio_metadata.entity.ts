import {
  BaseEntity,
  Column,
  Entity,
  IntegerType,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'audio_metadata' })
export class AudioMetadata extends BaseEntity {
  @PrimaryColumn({ type: 'int', nullable: false })
  sku: number; // id

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: false })
  description: string;

  @Column({ type: 'varchar', length: 255 })
  abridgement: string;

  @Column({ type: 'text', nullable: true })
  cover_url: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sample_url: string;

  @Column({ type: 'int', default: 0 })
  actual_size: IntegerType;

  @Column({ type: 'varchar', length: 255 })
  publisher: string;

  @Column({ type: 'varchar', nullable: true })
  runtime: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  copyright: string;

  @Column({ type: 'jsonb', nullable: false, default: [] })
  chapters: AudioChapter[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  sub_title: string;

  @Column({ type: 'date' })
  street_date: Date;

  @Column({ type: 'date' })
  modified_date: Date;

  @Column({ type: 'varchar', length: 255 })
  language: string;

  @Column({ type: 'jsonb', default: [] })
  authors: string[];

  @Column({ type: 'jsonb', default: [] })
  narrators: string[];

  @Column({ type: 'jsonb', nullable: true })
  bisac_codes: string[];

  @Column({ type: 'varchar', nullable: true })
  product_signature: string; // metadata_sig

  // @Column({ type: 'varchar', length: 255, nullable: true })
  @Column({ type: 'varchar', nullable: true })
  isbn: string;

  // @Column({ type: 'varchar', length: 255 })
  // genre: string;

  // @Column({ type: 'jsonb', default: [] })
  // other_genres: string[];

  @Column({ type: 'varchar', nullable: true })
  product_id: string; // library.id

  @Column({ type: 'varchar', nullable: true })
  retail_product_id: string; // retail.id

  @Column({ type: 'float', nullable: true })
  findaway_price: number; // library.list_price

  @Column({ type: 'float', nullable: true })
  findaway_content_cost: number; // library.content_cost

  @Column({ type: 'float', nullable: true })
  findaway_retail_price: number; // retail.list_price

  @Column({ type: 'float', nullable: true })
  findaway_retail_content_cost: number; // retail.content_cost

  @Column({ type: 'boolean', nullable: true })
  is_for_sale: boolean; // active_products != empty

  @Column({ type: 'jsonb', nullable: true })
  sales_locations: string[]; // library.territories

  @Column({ type: 'jsonb', nullable: true })
  sales_location_exclusions: string[];

  // @Column({ type: 'varchar', length: 255, nullable: true })
  // sample_title: string;
}

interface AudioChapter {
  part_number: number;
  chapter_number: number;
  duration: number;
}
