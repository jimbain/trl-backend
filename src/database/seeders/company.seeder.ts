import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RemoveOptions, Repository, SaveOptions } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { faker } from '@faker-js/faker';
import { MEDIA, Media } from 'src/constants';

@Injectable()
export class CompanySeeder {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async seed() {
    console.log(
      '###########################  COMPANY SEEDING START  ###########################',
    );

    const companies = [];
    const numberOfCompanies = 2;

    for (let i = 0; i < numberOfCompanies; i++) {
      companies.push({
        id: '',
        name: `Demo company ${i + 1}`,
        // logo_url: faker.image.url(),
        is_active: true,
        domain: `https://biz${i + 1}.trainingresourcelibrary.com`,
        description: faker.company.catchPhrase(),
        is_sso_login: i % 2 ? false : true,
        available_medias: [MEDIA.AUDIO, MEDIA.VIDEO, MEDIA.PHARMA],
        available_credits: 100,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        // color: '',
      });
    }

    for (const companyData of companies) {
      const company = this.companyRepository.create(companyData);
      await this.companyRepository.save(company);
    }

    console.log(
      '###########################  COMPANY SEEDING END  ###########################',
    );
  }
}
