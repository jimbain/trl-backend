import { MediaType } from 'src/constants';
import { User } from 'src/users/entities/user.entity';
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
import { ulid } from 'ulidx';
import { CompanyContract } from './company_contract.entity';

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

  @Column({ type: 'varchar' })
  color: string;

  @Column({ type: 'boolean', default: false })
  is_sso_login: boolean;

  @Column({ type: 'jsonb', nullable: true, default: ['audio'] })
  available_medias: MediaType[];

  @Column({ type: 'integer', default: 0 })
  available_credits: number;

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

  @OneToMany(() => CompanyContract, (contract) => contract.company)
  company_contracts: CompanyContract[];
}
