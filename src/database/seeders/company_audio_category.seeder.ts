import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyAudioCategory } from 'src/company/entities/company_audio_category.entity';
import { Company } from 'src/company/entities/company.entity';
import { AudioCategory } from 'src/audio/entities/audio_category.entity';
import { faker } from '@faker-js/faker';

@Injectable()
export class CompanyAudioCategorySeeder {
    constructor(
        @InjectRepository(CompanyAudioCategory)
        private readonly companyAudioCategoryRepository: Repository<CompanyAudioCategory>,

        @InjectRepository(Company)
        private readonly companyRepository: Repository<Company>,

        @InjectRepository(AudioCategory)
        private readonly audioCategoryRepository: Repository<AudioCategory>,
    ) {}

    async seed() {
        const companies = await this.companyRepository.find();
        const audioCategories = await this.audioCategoryRepository.find();

        if (companies.length === 0 || audioCategories.length < 2) {
            console.log('Not enough companies or audio categories to seed');
            return;
        }

        for (const company of companies) {
            // Pick 2 random audio categories
            const selectedCategories = this.getRandomItems(audioCategories, 2);

            for (const category of selectedCategories) {
                let title;
                let isUnique = false;
                
                // Ensure the title is unique
                while (!isUnique) {
                    title = faker.commerce.department();
                    const existing = await this.companyAudioCategoryRepository.findOne({
                        where: { company_id: company.id, title: title },
                    });

                    if (!existing) {
                        isUnique = true;
                    }
                }

                const companyAudioCategory = this.companyAudioCategoryRepository.create({
                    company_id: company.id,
                    audio_category_id: category.id,
                    title: title,
                });

                await this.companyAudioCategoryRepository.save(companyAudioCategory);
            }

            console.log(`2 unique audio categories have been seeded for company: ${company.name}`);
        }

        console.log('CompanyAudioCategory seeding completed');
    }

    private getRandomItems<T>(items: T[], count: number): T[] {
        const shuffled = [...items].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }
}
