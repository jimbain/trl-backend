import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
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
        password: 'TrlPassword2024!@',
      },
      {
        first_name: 'Rakibul',
        last_name: 'Hasan',
        email: 'rhasan082@gmail.com',
        password: 'TrlPassword2024!@',
      },
      {
        first_name: 'Shafiur',
        last_name: 'Uchchhas',
        email: 'msruchchhas.dev@gmail.com',
        password: 'TrlPassword2024!@',
      },
      {
        first_name: 'Tanvir Anwar',
        last_name: 'Rafi',
        email: 'tanviranwarrafi@gmail.com',
        password: 'TrlPassword2024!@',
      },
      {
        first_name: 'Mark',
        last_name: 'Ramm',
        email: 'rjramm@trlonline.com',
        password: 'TrlPassword2024!@',
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
