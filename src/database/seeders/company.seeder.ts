import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/company/entities/company.entity';
import { faker } from '@faker-js/faker';

@Injectable()
export class CompanySeeder {
    constructor(
        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,
    ) {}

    async seed() {
        console.log('###########################  COMPANY SEEDING START  ###########################');

        const companies = [];
        const numberOfCompanies = 10;

        for (let i = 0; i < numberOfCompanies; i++) {
            companies.push({
                name: faker.company.name(),
                short_description: faker.company.catchPhrase(),
                long_description: faker.lorem.paragraph(),
                logo_url: faker.image.url(),
                is_active: faker.datatype.boolean(),
                domain: faker.internet.domainName(),
                is_sso_login: faker.datatype.boolean(),
                available_credits: faker.number.int({ min: 100, max: 500 }),
            });
        }

        for (const companyData of companies) {
            const company = this.companyRepository.create(companyData);
            await this.companyRepository.save(company);
        }

        console.log('###########################  COMPANY SEEDING END  ###########################');
    }
}
