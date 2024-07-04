import {
    BaseEntity,
    BeforeInsert,
    BeforeUpdate,
    Column,
    CreateDateColumn,
    Entity,
    OneToMany,
    PrimaryColumn,
    UpdateDateColumn,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ulid } from 'ulid';
import { Exclude } from 'class-transformer';
import { PasswordResetToken } from 'src/auth/entities/password-reset-token.entity';

@Entity({ name: 'users' })
export class User extends BaseEntity {
    @PrimaryColumn({ type: 'varchar', length: 40 })
    id: string;

    @Column({type: 'varchar', length: 50})
    first_name: string;

    @Column({type: 'varchar', length: 50})
    last_name: string;

    @Column({ type: 'varchar', length: 100, unique: true })
    email: string;

    @Exclude()
    @Column({ type: 'varchar', length: 255, unique: true })
    password: string;

    @Column({ type: 'varchar', length: 40 })
    password_salt: string;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @BeforeInsert()
    @BeforeUpdate()
    async hashPassword() {
        if (this.password) {
            this.password_salt = await bcrypt.genSalt(10);
            this.password = await bcrypt.hash(this.password, this.password_salt);
        }
    }

    @BeforeInsert()
    generateUlid() {
        this.id = 'user_' + ulid();
    }

    @BeforeUpdate()
    updateTimestamp() {
        this.updated_at = new Date();
    }

    @OneToMany(() => PasswordResetToken, (token) => token.user)
    passwordResetTokens: PasswordResetToken[];
}