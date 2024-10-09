import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Category } from 'src/categories/entities/category.entity';
import { ulid } from 'ulid';

@Entity({ name: 'company_categories' })
export class CompanyCategory extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  @Column()
  company_id: string;

  @Column()
  category_id: string;

  @ManyToOne(() => Company, (company) => company.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Category, (category) => category.id, { onDelete: 'CASCADE'})
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ type: 'varchar', length: 255, nullable: true })
  display_title: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'company_category_' + ulid();
  }
}
