import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { MEDIA_TYPES, MediaType, USER_ACTITIVITY } from 'src/constants';

@Entity({ name: 'user_activity_logs' })
export class UserActivityLog extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column()
  user_id: string;

  @Column()
  item_id: string;

  @Column({
    type: 'enum',
    enum: MEDIA_TYPES,
    default: 'audio',
  })
  item_type: MediaType;

  @Column({
    type: 'enum',
    enum: USER_ACTITIVITY,
    default: USER_ACTITIVITY.QUEUE,
  })
  action_type: USER_ACTITIVITY;

  @Column({ type: 'int', default: 0 })
  credit_used: number;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
