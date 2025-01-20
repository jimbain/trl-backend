import {
  BaseEntity,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'notifications' })
export class Notification extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column()
  event_type: string;

  @Column({ type: 'jsonb', nullable: false, default: [] })
  data: { string: any };

  @Column({ type: 'varchar', length: 100, comment: 'e.g. user,company' })
  recipient_type: string;

  @Column({ type: 'varchar' })
  recipient_id: string;

  @Column({ type: 'jsonb', nullable: false, default: {} })
  users_read_status: object;

  @Column({ type: 'timestamp', nullable: true })
  expire_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
