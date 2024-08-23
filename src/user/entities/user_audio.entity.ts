import {
    BaseEntity,
    Column,
    Entity,
    ManyToOne,
    JoinColumn,
    PrimaryColumn,
    BeforeUpdate,
    BeforeInsert,
} from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Audio } from 'src/audio/entities/audio.entity';
import { ulid } from 'ulid';

@Entity({ name: 'user_audios' })
export class UserAudio extends BaseEntity {
    @PrimaryColumn({ type: 'varchar', length: 45 })
    id: string;

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

    @Column({ type: 'timestamp', nullable: true, comment: "Only for Rent" })
    expired_at: Date;

    @BeforeInsert()
    generateUlid() {
        this.id = 'user_audio_' + ulid();
    }

    @BeforeUpdate()
    updateUpdatedAtColumn(){
        this.updated_at = new Date();
    }
}
