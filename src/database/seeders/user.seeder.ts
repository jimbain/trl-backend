import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { faker } from '@faker-js/faker';

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

    const companies = await this.companyRepository.find();

    if (companies.length === 0) {
      console.log('No companies found to assign users to');
      return;
    }

    const users = [
      {
        first_name: 'Mashfiqur',
        last_name: 'Rahman',
        email: 'mashfiqurrr@gmail.com',
        password: 'test',
      },
      {
        first_name: 'Rakibul',
        last_name: 'Hasan',
        email: 'rhasan082@gmail.com',
        password: 'test',
      },
      {
        first_name: 'Tanvir Anwar',
        last_name: 'Rafi',
        email: 'tanviranwarrafi@gmail.com',
        password: 'test',
      },
      {
        first_name: 'Mark',
        last_name: 'Ramm',
        email: 'test@test.com',
        password: 'test',
      },
      {
        first_name: 'SSO',
        last_name: 'User',
        email: 'bulajeju@teleg.eu',
        password: 'test',
      },
    ];

    for (const user of users) {
      const randomCompany =
        companies[Math.floor(Math.random() * companies.length)];

      const userEntity = this.userRepository.create({
        ...user,
        company: randomCompany,
      });

      await this.userRepository.save(userEntity);
    }

    console.log(
      '###########################  USER SEEDING END  ###########################',
    );
  }
}
