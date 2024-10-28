import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { faker } from '@faker-js/faker';
import { CompanyCategory } from 'src/companies/entities/company_category.entity';
import { Category } from 'src/categories/entities/category.entity';

@Injectable()
export class CompanyCategorySeeder {
  constructor(
    @InjectRepository(CompanyCategory)
    private readonly companyCategoryRepository: Repository<CompanyCategory>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async seed() {
    console.log(
      '###########################  COMPANY AUDIO CATEGORY SEEDING START  ###########################',
    );
    const companies = await this.companyRepository.find();
    const audioCategories = await this.categoryRepository.find();
    if (companies.length === 0 || audioCategories.length < 10) {
      console.log('Not enough companies or audio categories to seed');
      return;
    }
    for (const company of companies) {
      for (const audioCategory of audioCategories) {
        const companyAudioCategory = this.companyCategoryRepository.create({
          company_id: company.id,
          category_id: audioCategory.id,
        });
        await this.companyCategoryRepository.save(companyAudioCategory);
      }
    }

    console.log(
      '###########################  COMPANY CATEGORY SEEDING END  ###########################',
    );
  }

  private getRandomItems<T>(items: T[], count: number): T[] {
    const shuffled = [...items].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
}
