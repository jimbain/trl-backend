import {
    BaseEntity,
    Column,
    Entity,
} from 'typeorm';

@Entity({ name: 'app_config' })
export class AppConfig extends BaseEntity {
    @Column({ type: 'int', default: 14, comment: "In days" })
    audio_rental_period: number;

    @Column({ type: 'int', default: 1 })
    audio_rental_credit_cost: number;

    @Column({ type: 'int', default: 1 })
    video_rental_credit_cost: number;

    @Column({ type: 'int', default: 1 })
    pharma_rental_credit_cost: number;

    @Column({ type: 'jsonb', nullable: true })
    audio_ignored_languages: string[];

    @Column({ type: 'varchar', nullable: true })
    master_password: string;

    @Column({ type: 'int', nullable: true, comment: "Send notif before expire days" })
    rent_expire_notification_days: number;

    @Column({ type: 'int', default: 1 })
    max_rental_items_per_period: number;

    @Column({ type: 'int', default: 1 })
    max_rental_items_on_hand: number;

    @Column({
        type: 'enum',
        enum: ['month', 'week'],
        default: 'month',
    })
    rental_period_unit: 'month' | 'week';
}
