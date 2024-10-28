import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { MEDIA, Media, USER_ACTITIVITY, UserActivity } from 'src/constants';

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
    enum: Object.values(MEDIA),
    default: MEDIA.AUDIO,
  })
  item_type: Media;

  @Column({
    type: 'enum',
    enum: Object.values(USER_ACTITIVITY),
    nullable: false,
  })
  action_type: UserActivity;

  @Column({ type: 'int', default: 0 })
  credit_used: number;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
