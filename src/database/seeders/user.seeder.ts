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
        const companies = await this.companyRepository.find();

        if (companies.length === 0) {
            console.log('No companies found to assign users to');
            return;
        }

        const emails = [
            'mashfiqurrr@gmail.com',
            'rhasan082@gmail.com',
            'msruchchhas.dev@gmail.com',
            'tanviranwarrafi@gmail.com',
        ];

        const password = 'TrlPassword2024!@';

         for (const email of emails) {
            const randomCompany = companies[Math.floor(Math.random() * companies.length)];

            const user = this.userRepository.create({
                first_name: faker.person.firstName(),
                last_name: faker.person.lastName(),
                email: email,
                password: password,
                company: randomCompany,
            });

            await this.userRepository.save(user);
        }

        console.log('User seeding completed');
    }
}
