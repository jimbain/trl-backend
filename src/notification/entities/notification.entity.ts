import {
  BaseEntity,
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationData } from '../notification.interface';

@Entity({ name: 'notifications' })
export class Notification extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column()
  event_type: string;

  @Column({ type: 'jsonb', nullable: true })
  data: NotificationData;

  @Column({ type: 'jsonb', nullable: false, default: [] })
  user_ids: string[];

  @Column({ type: 'jsonb', nullable: false, default: {} })
  users_read_status: object;

  @Column({ type: 'timestamp', nullable: true })
  expire_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  sent_at: Date | null;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  meta: Record<string, any>;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
