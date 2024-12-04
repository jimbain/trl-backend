import {
    BaseEntity,
    Column,
    Entity,
    ManyToOne,
    JoinColumn,
    Unique,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/users/entities/user.entity';

@Entity({ name: 'user_devices' })
@Unique(['user_id', 'device_id'])
export class UserDevice extends BaseEntity {
    @PrimaryGeneratedColumn({ type: 'int' })
    id: number;

    @Column()
    user_id: string;

    @Column()
    device_id: string;

    @Column({nullable: true})
    device_model: string;

    @Column({nullable: true})
    device_os: string;

    @Column({ type: 'text', nullable: true })
    fcm_key: string;

    @Column({ type: 'boolean', default: true })
    is_active: boolean;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;
}
