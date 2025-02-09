import { CATALOG_CATEGORY_TYPE, CatalogCategoryType } from 'src/constants';
import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulidx';

@Entity({ name: 'categories' })
export class Category extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: Object.values(CATALOG_CATEGORY_TYPE),
    default: CATALOG_CATEGORY_TYPE.DEFAULT,
  })
  type: CatalogCategoryType;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @BeforeInsert()
  generateUlid() {
    if (!this.id) {
      this.id = 'category_' + ulid();
    }
  }
}
