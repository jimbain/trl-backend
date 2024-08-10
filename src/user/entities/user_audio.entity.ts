import {
    BaseEntity,
    Column,
    Entity,
    ManyToOne,
    JoinColumn,
    PrimaryColumn,
    BeforeUpdate,
} from 'typeorm';
import { User } from './user.entity';
import { Audio } from 'src/audio/entities/audio.entity';

@Entity({ name: 'user_audios' })
export class UserAudio extends BaseEntity {
    @PrimaryColumn()
    user_id: string;

    @PrimaryColumn()
    audio_id: string;

    @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'audio_id' })
    audio: Audio;

    @Column({
        type: 'enum',
        enum: ['queued', 'rented', 'bookshelved'],
        default: 'queued',
    })
    status: 'queued' | 'rented' | 'bookshelved';

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @BeforeUpdate()
    updateUpdatedAtColumn(){
        this.updated_at = new Date();
    }
}
