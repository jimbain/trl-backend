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
import { MEDIA_AVAILABILITY_TYPE, MediaAvailabilityType } from 'src/constants';

@Entity({ name: 'audios' })
export class Audio extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column()
  sku: string;

  // @TODO: move to metadata table
  @Column({
    type: 'enum',
    enum: Object.values(MEDIA_AVAILABILITY_TYPE),
    default: MEDIA_AVAILABILITY_TYPE.BOTH,
  })
  available_for: MediaAvailabilityType;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_excluded: boolean;

  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  // @TODO: move to metadata table
  @Column({ type: 'boolean', default: true })
  is_only_for_purchase: boolean;

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

  @Column({ type: 'jsonb', nullable: false, default: [] })
  categories: string[]; // categories.id[]

  @Column({ type: 'jsonb', nullable: false, default: [] })
  suggestions: string[]; // audios.id[]

  @Column({ type: 'int', default: 0 })
  purchased_rental_licenses: number;

  @Column({ type: 'int', default: 0 })
  purchased_rental_license_limit: number;

  @Column({ type: 'int', default: 0 })
  total_rented: number;

  @Column({ type: 'int', default: 0 })
  total_played: number;

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

  @OneToOne(() => AudioMetadata)
  @JoinColumn({ name: 'sku', referencedColumnName: 'sku' })
  metadata: AudioMetadata;

  @BeforeInsert()
  generateUlid() {
    this.id = 'audio_' + ulid();
  }
}
