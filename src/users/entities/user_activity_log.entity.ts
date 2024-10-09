import {
    BaseEntity,
    Column,
    Entity,
    ManyToOne,
    JoinColumn,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity({ name: 'user_activity_logs' })
export class UserAudioStatus extends BaseEntity {
    @PrimaryGeneratedColumn({type: 'int'})
    id: number

    @Column()
    user_id: string;

    @Column()
    item_id: string;

    @Column({
        type: 'enum',
        enum: ['audio', 'video', 'pharma'],
        default: 'audio',
    })
    item_type: 'audio' | 'video' | 'pharma';

    @Column({
        type: 'enum',
        enum: ['queue', 'rent', 'keep', 'play'],
        default: 'queue',
    })
    action_type: 'queue' | 'rent' | 'keep' | 'play';

    @Column({ type: 'int', default: 0 })
    credit_used: number;

    @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}
