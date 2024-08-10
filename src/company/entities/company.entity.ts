import { User } from 'src/user/entities/user.entity';
import {
    BaseEntity,
    BeforeInsert,
    Column,
    CreateDateColumn,
    DeleteDateColumn,
    Entity,
    OneToMany,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

@Entity({ name: 'companies' })
export class Company extends BaseEntity {
    @PrimaryColumn({ type: 'varchar', length: 35 })
    id: string;

    @Column({type: 'varchar', length: 255, unique: true})
    name: string;

    @Column({type: 'text', nullable: true})
    short_description: string;

    @Column({type: 'text', nullable: true})
    long_description: string;

    @Column({type: 'text', nullable: true})
    logo_url: string;

    @Column({type: 'boolean', default: true})
    is_active: boolean

    @Column({type: 'varchar', length: 255, unique: true, nullable: true})
    domain: string;
    
    @Column({type: 'boolean', default: false})
    is_sso_login: boolean

    @Column({type: 'integer', default: 0})
    available_credits: number

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @DeleteDateColumn()
    deleted_at: Date;

    @BeforeInsert()
    generateUlid() {
        this.id = 'company_' + ulid();
    }

    @OneToMany(() => User, (user) => user.company)
    users: User[];
}