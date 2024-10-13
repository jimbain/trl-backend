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
    private readonly companyAudioCategoryRepository: Repository<CompanyCategory>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(Category)
    private readonly audioCategoryRepository: Repository<Category>,
  ) {}

  async seed() {
    return;
    // console.log(
    //   '###########################  COMPANY AUDIO CATEGORY SEEDING START  ###########################',
    // );

    // const companies = await this.companyRepository.find();
    // const audioCategories = await this.audioCategoryRepository.find();

    // if (companies.length === 0 || audioCategories.length < 10) {
    //   console.log('Not enough companies or audio categories to seed');
    //   return;
    // }

    // for (const company of companies) {
    //   // Pick 10 random audio categories
    //   const selectedCategories = this.getRandomItems(audioCategories, 20);

    //   for (let i = 0; i < 20; i++) {
    //     let title: string | null = null;

    //     // Set title to null for the first 3 entries, and generate a unique title for the next 7
    //     if (i >= 10) {
    //       let isUnique = false;

    //       // Ensure the title is unique and different from the audio category title
    //       while (!isUnique) {
    //         const generatedTitle = faker.commerce.department();
    //         const existingTitle = selectedCategories[i].title;

    //         const existing = await this.companyAudioCategoryRepository.findOne({
    //           where: { company_id: company.id, title: generatedTitle },
    //         });

    //         if (!existing && generatedTitle !== existingTitle) {
    //           title = generatedTitle;
    //           isUnique = true;
    //         }
    //       }
    //     }

    //     const companyAudioCategory = this.companyAudioCategoryRepository.create(
    //       {
    //         company_id: company.id,
    //         audio_category_id: selectedCategories[i].id,
    //         title: title,
    //       },
    //     );

    //     await this.companyAudioCategoryRepository.save(companyAudioCategory);
    //   }

    //   console.log(
    //     `10 audio categories have been seeded for company: ${company.name}`,
    //   );
    // }

    // console.log(
    //   '###########################  COMPANY AUDIO CATEGORY SEEDING END  ###########################',
    // );
  }

  private getRandomItems<T>(items: T[], count: number): T[] {
    const shuffled = [...items].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
}
