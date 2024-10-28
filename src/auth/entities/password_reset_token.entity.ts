import { NOTIFICATION_CHANNEL, NotificationChannel } from 'src/constants';
import { User } from 'src/users/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  JoinColumn,
} from 'typeorm';

@Entity({ name: 'password_reset_tokens' })
export class PasswordResetToken extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  token: string;

  @Column({ nullable: true, length: 4 })
  otp: string;

  @Column({
    type: 'enum',
    enum: Object.values(NOTIFICATION_CHANNEL),
    enumName: 'otp_channel',
    default: NOTIFICATION_CHANNEL.EMAIL,
  })
  otp_channel: NotificationChannel;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @ManyToOne(() => User, (user) => user.passwordResetTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
