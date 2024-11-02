import { BaseEntity, Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'app_config' })
export class AppConfig extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', unique: true })
  key: string;

  @Column({ type: 'varchar' })
  value: string;
}
