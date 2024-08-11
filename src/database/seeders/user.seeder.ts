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

        for (const company of companies) {
            const users = [];

            for (let i = 0; i < 10; i++) {
                const password = 'TrlPassword2024!@';
                
                users.push({
                    first_name: faker.person.firstName(),
                    last_name: faker.person.lastName(),
                    email: faker.internet.email().toLowerCase(),
                    password: password,  
                    company: company,
                });
            }

            for (const userData of users) {
                const user = this.userRepository.create(userData);
                await this.userRepository.save(user);
            }

            console.log(`10 users have been seeded for company: ${company.name}`);
        }

        console.log('User seeding completed');
    }
}
