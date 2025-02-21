import {
  BaseEntity,
  Column,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { ImportUser } from '../user.interface';

@Entity({ name: 'user_registration_logs' })
export class UserRegistrationLog extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number;

  @Column()
  company_id: string;

  @Column({ type: 'jsonb' })
  csv_content: ImportUser[];

  @Column({ type: 'jsonb', nullable: true })
  meta: object;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Company, (company) => company.user_registration_logs, {
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
