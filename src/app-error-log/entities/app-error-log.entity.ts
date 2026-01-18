import { User } from 'src/users/entities/user.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('app_error_logs')
export class AppErrorLog {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', nullable: true })
  user_id: string | null;

  @Column({ type: 'varchar' })
  app_version: string;

  @Column({ type: 'varchar', enum: ['ios', 'android'] })
  app_platform: 'ios' | 'android';

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text' })
  stack_trace: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
