import {
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
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
import { PharmaReview } from 'src/pharma/entities/pharma-review.entity';
import { PharmaUserStatus } from 'src/pharma/entities/pharma-user-status.entity';
import { PharmaUserVideoplayerPosition } from 'src/pharma/entities/pharma-user-videoplayer-position.entity';
import { VideoReview } from 'src/video/entities/video-review.entity';
import { VideoUserStatus } from 'src/video/entities/video-user-status.entity';

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

  @Column({ type: 'varchar', length: 50, unique: false, nullable: true })
  phone: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255, unique: true })
  password: string;

  @Column()
  company_id: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'boolean', default: false })
  optout_push_notification: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

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

  @OneToMany(() => PharmaReview, (review) => review.pharma)
  pharmaReviews: PharmaReview[];

  @OneToMany(() => PharmaUserStatus, (status) => status.user)
  pharmaUserStatuses: PharmaUserStatus[];

  @OneToMany(() => PharmaUserVideoplayerPosition, (position) => position.user)
  videoplayerPositions: PharmaUserVideoplayerPosition[];

  @OneToMany(() => VideoReview, (review) => review.user)
  videoReviews: VideoReview[];

  @OneToMany(() => VideoUserStatus, (status) => status.user)
  videoUserStatuses: VideoUserStatus[];
}
