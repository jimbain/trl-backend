import {
  COMPANY_LOGIN_TYPE,
  CompanyLoginEnumType,
  MEDIA,
  Media,
} from 'src/constants';
import { User } from 'src/users/entities/user.entity';
import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulidx';
import { CompanyContact } from '../company.interface';
import { UserRegistrationLog } from 'src/users/entities/user_registration_log.entity';

@Entity({ name: 'companies' })
export class Company extends BaseEntity {
  @PrimaryColumn({ type: 'varchar', length: 35 })
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  logo_url: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  domain: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: Object.values(COMPANY_LOGIN_TYPE),
    default: COMPANY_LOGIN_TYPE.CREDENTIALS,
  })
  login_type: CompanyLoginEnumType;

  @Column({ type: 'jsonb', default: null })
  sso_config: object;

  @Column({ type: 'jsonb', nullable: true, default: [MEDIA.AUDIO] })
  available_medias: Media[];

  @Column({ type: 'jsonb', nullable: true, default: [] })
  catalogs: number[];

  @Column({ type: 'jsonb', nullable: true, default: {} })
  app_configs: Record<string, string> | null;

  @Column({ type: 'integer', default: 0 })
  available_credits: number;

  @Column({ type: 'jsonb', default: [] })
  contacts: CompanyContact[];

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

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @BeforeInsert()
  generateUlid() {
    this.id = 'company_' + ulid();
  }

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(
    () => UserRegistrationLog,
    (userRegistrationLog) => userRegistrationLog.company,
  )
  user_registration_logs: UserRegistrationLog[];
}
