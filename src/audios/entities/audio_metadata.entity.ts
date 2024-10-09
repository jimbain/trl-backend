import {
  BaseEntity,
  Column,
  Entity,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'audio_metadata' })
export class AudioMetadata extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  sku: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'jsonb', nullable: true })
  authors: string[];

  @Column({ type: 'varchar', length: 255 })
  isbn: string;

  @Column({ type: 'varchar', length: 255 })
  publisher: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 255 })
  language: string;

  @Column({ type: 'int', default: 0 })
  file_size: number;

  @Column({ type: 'varchar', length: 255 })
  genre: string;

  @Column({ type: 'jsonb', default: [] })
  other_genres: string[];

  @Column({ type: 'jsonb', default: [] })
  narrators: string[];

  @Column({ type: 'varchar', length: 255 })
  abridgement: string;

  @Column({ type: 'jsonb', nullable: true })
  bisac_codes: string[];

  @Column({ type: 'varchar', nullable: true })
  length: string;

  @Column({ type: 'varchar', nullable: true })
  product_id: string;

  @Column({ type: 'varchar', nullable: true })
  retail_product_id: string;

  @Column({ type: 'varchar', nullable: true })
  product_signature: string;

  @Column({ type: 'float', default: 0 })
  findaway_price: number;

  @Column({ type: 'float', default: 0 })
  findaway_retail_price: number;

  @Column({ type: 'float', default: 0 })
  findaway_content_cost: number;

  @Column({ type: 'float', default: 0 })
  findaway_retail_content_cost: number;

  @Column({ type: 'boolean', default: true })
  is_for_sale: boolean;
  
  @Column({ type: 'jsonb', default: ['world'] })
  sales_locations: string[];

  @Column({ type: 'jsonb', default: ['ROW'] })
  sales_location_exclusions: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  copyright: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sample_title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sample_url: string;

  @Column({ type: 'text', nullable: true })
  cover_url: string;
}
