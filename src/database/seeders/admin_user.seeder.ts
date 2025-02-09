import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from 'src/admin/entities/admin_user.entity';

@Injectable()
export class AdminUserSeeder {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,
  ) {}

  async seed() {
    console.log(
      '###########################  ADMIN USER SEEDING START  ###########################',
    );

    const users = [
      {
        name: 'Mark Ramm',
        email: 'markramm.trlaudio@gmail.com',
        password: 'test',
      },
    ];

    for (const user of users) {
      const userEntity = this.adminUserRepository.create(user);
      await this.adminUserRepository.save(userEntity);
    }

    console.log(
      '###########################  ADMIN USER SEEDING END  ###########################',
    );
  }
}
