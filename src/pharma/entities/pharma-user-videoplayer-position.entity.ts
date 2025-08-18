import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Unique,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Pharma } from './pharma.entity';
import { User } from 'src/users/entities/user.entity';

@Entity('pharma_user_videoplayer_positions')
@Unique('UQ_PHARMA_USER_VIDEOPLAYER_POSITIONS_PHARMA_USER', ['pharma', 'user'])
export class PharmaUserVideoplayerPosition {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 34 })
  pharma_id: string;

  @Column({ type: 'varchar', length: 32 })
  user_id: string;

  @Column({ type: 'int' })
  play_position: number | null;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @ManyToOne(() => Pharma, (pharma) => pharma.videoplayerPositions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pharma_id' })
  pharma: Pharma;

  @ManyToOne(() => User, (user) => user.videoplayerPositions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
