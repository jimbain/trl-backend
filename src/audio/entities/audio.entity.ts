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

@Entity({ name: 'audios' })
export class Audio extends BaseEntity {
    @PrimaryColumn({ type: 'varchar', length: 35 })
    id: string;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({type: 'text', nullable: true})
    short_description: string;

    @Column({type: 'text', nullable: true})
    long_description: string;

    @Column({ type: 'jsonb', nullable: true })
    audio_category_ids: string[];

    @Column({ type: 'varchar', nullable: true })
    language: string;

    @Column({ type: 'varchar', nullable: true })
    publisher: string;

    @Column({ type: 'date', nullable: true })
    copyright: Date;

    @Column({ type: 'jsonb', nullable: true })
    authors: string[];

    @Column({ type: 'float', default: 0 })
    rental_cost: number;

    @Column({ type: 'float', default: 0 })
    bookshelf_cost: number;

    @Column({ type: 'int', default: 0 })
    rental_credit: number;

    @Column({ type: 'int', default: 0 })
    bookshelf_credit: number;

    @Column({ type: 'int', default: 0, comment: "Duration in seconds" })
    duration: number;

    @Column({ type: 'boolean', default: false })
    is_featured: boolean;

    @Column({
        type: 'enum',
        enum: ['rent', 'bookshelf', 'both'],
        default: 'both',
    })
    available_for: 'rent' | 'bookshelf' | 'both';

    @Column({ type: 'text', nullable: true })
    image_url: string;

    @Column({ type: 'jsonb', nullable: true })
    audio_urls: string[];

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @DeleteDateColumn()
    deleted_at: Date;

    @BeforeInsert()
    generateUlid() {
        this.id = 'audio_' + ulid();
    }
}
