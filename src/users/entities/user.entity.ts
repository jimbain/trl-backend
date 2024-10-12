import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ulid } from 'ulidx';
import { Exclude } from 'class-transformer';
import { PasswordResetToken } from 'src/auth/entities/password_reset_token.entity';
import { Company } from 'src/companies/entities/company.entity';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  @Column({ type: 'varchar', length: 50 })
  first_name: string;

  @Column({ type: 'varchar', length: 50 })
  last_name: string;

  @Column({ type: 'varchar', nullable: true })
  title: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, unique: true })
  password: string;

  @Column()
  company_id: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @Column({ type: 'varchar', nullable: true })
  address1: string;

  @Column({ type: 'varchar', nullable: true })
  address2: string;

  @Column({ type: 'varchar', nullable: true })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  state: string;

  @Column({ type: 'varchar', nullable: true })
  zip: string;

  @Column({ type: 'boolean', default: false })
  optout_push_notification: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  // ########################################################################################## //

  @ManyToOne(() => Company, (company) => company.users, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword() {
    if (this.password) {
      this.password = await bcrypt.hash(
        this.password,
        await bcrypt.genSalt(10),
      );
    }
  }

  @BeforeInsert()
  generateUlid() {
    this.id = 'user_' + ulid();
  }

  @OneToMany(() => PasswordResetToken, (token) => token.user)
  passwordResetTokens: PasswordResetToken[];
}
