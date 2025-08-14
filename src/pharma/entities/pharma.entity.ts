import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import { PharmaReview } from './pharma-review.entity';
import { PharmaUserStatus } from './pharma-user-status.entity';
import { ulid } from 'ulidx';

@Entity('pharmas')
export class Pharma {
  @PrimaryColumn({ type: 'varchar', length: 34 })
  id: string;

  @Column({ type: 'varchar', unique: true })
  sku?: string;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_featured: boolean;

  @Column({ type: 'varchar', nullable: true })
  image_url?: string;

  @Column({ type: 'varchar', nullable: true })
  video_url?: string;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  categories: string[];

  @Column({ type: 'varchar', nullable: true })
  runtime?: string;

  @Column({ type: 'float', default: 0 })
  avg_rating: number;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'pharma_' + ulid();
  }

  @OneToMany(() => PharmaReview, (review) => review.pharma)
  reviews: PharmaReview[];

  @OneToMany(() => PharmaUserStatus, (status) => status.pharma)
  userStatuses: PharmaUserStatus[];
}
