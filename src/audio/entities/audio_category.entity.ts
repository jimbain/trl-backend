import {
    BaseEntity,
    BeforeInsert,
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

@Entity({ name: 'audio_categories' })
export class AudioCategory extends BaseEntity {
    @PrimaryColumn({ type: 'varchar', length: 45 })
    id: string;

    @Column({type: 'varchar', length: 255})
    title: string;

    @Column({type: 'varchar', length: 255, unique: true})
    name: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @DeleteDateColumn()
    deleted_at: Date;

    @BeforeInsert()
    generateUlid() {
        this.id = 'audio_category_' + ulid();
    }
}