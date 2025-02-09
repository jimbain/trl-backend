import {
  CATALOG_CATEGORY_TYPE,
  CatalogCategoryType,
  MEDIA,
  Media,
} from 'src/constants';
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'catalogs' })
export class Catalog extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: Object.values(CATALOG_CATEGORY_TYPE),
    default: CATALOG_CATEGORY_TYPE.DEFAULT,
  })
  type: CatalogCategoryType;

  @Column({
    type: 'enum',
    enum: Object.values(MEDIA),
    default: MEDIA.AUDIO,
  })
  media_type: Media;

  @Column({ type: 'jsonb', nullable: true, default: [] })
  categories: string[];

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
