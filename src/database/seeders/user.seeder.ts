import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { faker } from '@faker-js/faker';
import { COMPANY_LOGIN_TYPE } from 'src/constants';

@Injectable()
export class UserSeeder {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async seed() {
    console.log(
      '###########################  USER SEEDING START  ###########################',
    );

    const regularCompany = await this.companyRepository.findOne({
      where: { login_type: COMPANY_LOGIN_TYPE.CREDENTIALS },
    });

    const ssoCompany = await this.companyRepository.findOne({
      where: { login_type: COMPANY_LOGIN_TYPE.SSO },
    });

    if (!regularCompany || !ssoCompany) {
      console.log('No companies found to assign users to');
      return;
    }

    const users = [
      {
        first_name: 'Mashfiqur',
        last_name: 'Rahman',
        email: 'mashfiqurrr@gmail.com',
        password: 'test',
        is_sso: false,
      },
      {
        first_name: 'Rakibul',
        last_name: 'Hasan',
        email: 'rhasan082@gmail.com',
        password: 'test',
        is_sso: false,
      },
      {
        first_name: 'Tanvir Anwar',
        last_name: 'Rafi',
        email: 'tanviranwarrafi@gmail.com',
        password: 'test',
        is_sso: false,
      },
      {
        first_name: 'Mark',
        last_name: 'Ramm',
        email: 'test@test.com',
        password: 'test',
        is_sso: false,
      },
      {
        first_name: 'SSO',
        last_name: 'User',
        email: 'bulajeju@teleg.eu',
        password: 'test',
        is_sso: true,
      },
    ];

    for (const user of users) {
      const userEntity = this.userRepository.create({
        ...user,
        company: user.is_sso ? ssoCompany : regularCompany,
      });

      await this.userRepository.save(userEntity);
    }

    console.log(
      '###########################  USER SEEDING END  ###########################',
    );
  }
}
