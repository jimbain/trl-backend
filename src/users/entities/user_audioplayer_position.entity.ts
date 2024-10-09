import {
    BaseEntity,
    Column,
    Entity,
    ManyToOne,
    JoinColumn,
    PrimaryColumn,
    BeforeInsert,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { ulid } from 'ulid';

@Entity({ name: 'user_audioplayer_positions' })
export class UserAudioplayerPosition extends BaseEntity {
    @PrimaryColumn({ type: 'varchar', length: 45 })
    id: string;

    @PrimaryColumn()
    user_id: string;

    @PrimaryColumn()
    audio_id: string;

    @Column({ type: 'int', nullable: true })
    chapter_id: number;

    @Column({ type: 'int', nullable: true })
    play_position: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => Audio, (audio) => audio.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'audio_id' })
    audio: Audio;

    @BeforeInsert()
    generateUlid() {
        this.id = 'user_audioplayer_position_' + ulid();
    }
}
