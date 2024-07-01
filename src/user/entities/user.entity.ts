import {
    BaseEntity,
    BeforeInsert,
    BeforeUpdate,
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { Exclude } from 'class-transformer';
import { PasswordResetToken } from 'src/auth/entities/password-reset-token.entity';

@Entity({ name: 'users' })
export class User extends BaseEntity {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    ulid: string;

    @Column({type: 'varchar', length: 120})
    first_name: string;

    @Column({type: 'varchar', length: 100})
    last_name: string;

    @Column({ type: 'varchar', unique: true, length: 150 })
    email: string;

    @Exclude()
    @Column({type: 'varchar'})
    password: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @BeforeInsert()
    @BeforeUpdate()
    async hashPassword() {
        if (this.password) {
            const salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, salt);
        }
    }

    @BeforeInsert()
    generateUlid() {
        this.ulid = ulid();
    }

    @BeforeUpdate()
    updateTimestamp() {
        this.updated_at = new Date();
    }

    @OneToMany(() => PasswordResetToken, (token) => token.user)
    passwordResetTokens: PasswordResetToken[];
}