import { User } from 'src/users/entities/user.entity';
import {
  BaseEntity,
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from './company.entity';
import {
  COMPANY_CONTACT_RESPONSIBILITY,
  CompanyContactResponsibility,
} from 'src/constants';

@Entity({ name: 'company_contacts' })
export class CompanyContact extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Company, (company) => company.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'varchar' })
  contact_name: string;

  @Column({ type: 'varchar' })
  contact_phone: string;

  @Column({ type: 'varchar' })
  contact_email: string;

  @Column({ type: 'jsonb' })
  contact_responsibility: CompanyContactResponsibility[];
}
