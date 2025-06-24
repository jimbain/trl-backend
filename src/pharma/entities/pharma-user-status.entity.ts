import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  BeforeInsert,
} from 'typeorm';
import { Pharma } from '../../pharma/entities/pharma.entity';
import { MediaStatus, USER_MEDIA_STATUS } from 'src/constants';
import { User } from 'src/users/entities/user.entity';
import { ulid } from 'ulidx';

@Entity('pharma_user_statuses')
@Unique('UQ_PHARMA_USER_STATUSES_PHARMA_USER', ['user_id', 'pharma_id'])
export class PharmaUserStatus {
  @PrimaryColumn({ type: 'varchar', length: 45 })
  id: string;

  @Column({ type: 'varchar' })
  pharma_id: string;

  @Column({ type: 'varchar' })
  user_id: string;

  @Column({
    type: 'enum',
    enum: USER_MEDIA_STATUS,
    default: USER_MEDIA_STATUS.QUEUED,
  })
  status: MediaStatus;

  @Column({ type: 'timestamp', nullable: true })
  rental_start_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  current_rental_expire_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  next_rental_expire_at?: Date;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'pharma_user_status_' + ulid();
  }

  @ManyToOne(() => Pharma, (pharma) => pharma.userStatuses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pharma_id' })
  pharma: Pharma;

  @ManyToOne(() => User, (user) => user.pharmaUserStatuses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
