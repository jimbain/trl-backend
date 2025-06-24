import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  BeforeInsert,
} from 'typeorm';
import { Pharma } from '../../pharma/entities/pharma.entity';
import { User } from 'src/users/entities/user.entity';
import { ulid } from 'ulidx';

@Entity('pharma_reviews')
@Unique('UQ_PHARMA_REVIEWS_PHARMA_USER', ['pharma_id', 'user_id'])
export class PharmaReview {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column({ type: 'varchar' })
  pharma_id: string;

  @Column({ type: 'varchar' })
  user_id: string;

  @Column({ type: 'int' })
  rate: number;

  @Column({ type: 'text', nullable: true })
  review?: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'pharma_review_' + ulid();
  }

  @ManyToOne(() => Pharma, (pharma) => pharma.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pharma_id' })
  pharma: Pharma;

  @ManyToOne(() => User, (user) => user.pharmaReviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
