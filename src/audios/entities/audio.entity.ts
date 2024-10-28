import { MEDIA_AVAILABILITY_TYPE, MediaAvailabilityType } from 'src/constants';
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
import { ulid } from 'ulidx';

@Entity({ name: 'audios' })
export class Audio extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column()
  sku: string;

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

  // @Column({ type: 'text', nullable: true })
  // image_url: string;

  @Column({ type: 'jsonb', nullable: false, default: [] })
  audio_categories: string[]; // categories.id[]

  @Column({ type: 'jsonb', nullable: false, default: [] })
  audio_suggestions: string[]; // audios.id[]

  @Column({ type: 'int', default: 0 })
  purchased_licenses: number; // QTO

  @Column({ type: 'int', default: 0 })
  purchased_license_limit: number; // QTO limit

  @Column({ type: 'int', default: 0 })
  total_rented: number; // QOH

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
