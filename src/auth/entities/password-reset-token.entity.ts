import { User } from 'src/user/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, BaseEntity } from 'typeorm';

@Entity({ name: 'password_reset_tokens' })
export class PasswordResetToken extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  token: string;

  @Column()
  otp: string;

  @Column({ type: 'timestamp' })
  expired_at: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @ManyToOne(() => User, (user) => user.passwordResetTokens, { onDelete: 'CASCADE' })
  user: User;
}
