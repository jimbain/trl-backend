import {
    BaseEntity,
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { AudioCategory } from 'src/audio/entities/audio_category.entity';

@Entity({ name: 'company_audio_categories' })
export class CompanyAudioCategory extends BaseEntity {
    constructor() {
        super();
        this.popularity = Math.floor(Math.random() * 901) + 100;
    }

    @PrimaryColumn()
    company_id: string;

    @PrimaryColumn()
    audio_category_id: string;

    @ManyToOne(() => Company, (company) => company.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'company_id' })
    company: Company;

    @ManyToOne(() => AudioCategory, (audioCategory) => audioCategory.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'audio_category_id' })
    audioCategory: AudioCategory;

    @Column({type: 'varchar', length: 255, nullable: true })
    title: string;

    popularity: number;
}