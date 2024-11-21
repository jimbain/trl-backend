import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from 'src/categories/entities/category.entity';

@Injectable()
export class CategorySeeder {
  constructor(
    @InjectRepository(Category)
    private readonly audioCategoryRepository: Repository<Category>,
  ) {}

  async seed() {
    console.log(
      '###########################  AUDIO CATEGORY SEEDING START  ###########################',
    );

    // push All Category
    const allCategory = this.audioCategoryRepository.create({
      title: 'All Category',
      id: 'category_0',
    });
    await this.audioCategoryRepository.save(allCategory);

    const audioCategories = [
      'Best of TRL',
      'Appearance',
      'Business Book Summaries',
      'Business Concepts',
      'Communication',
      'Creativity',
      'Decision Making',
      'Emotions',
      'Entrepreneurship',
      'Family',
      'Feelings',
      'Financial',
      'Future',
      'Health',
      'Language',
      'Management',
      'Marketing',
      'Mind Development',
      'Negotiation',
      'Personal Development',
      'Pharmaceutical Selling',
      'Relaxation',
      'Selling',
      'Stress',
      'Success',
      'Time Management',
      'Sales Management',
      'Diversity',
      '-3LG Only',
      '3LG Only',
    ];

    const audioCategoryEntities = Array.from(audioCategories).map((name) => ({
      title: name,
    }));

    for (const categoryData of audioCategoryEntities) {
      const audioCategory = this.audioCategoryRepository.create(categoryData);
      await this.audioCategoryRepository.save(audioCategory);
    }

    console.log(
      '###########################  AUDIO CATEGORY SEEDING END  ###########################',
    );
  }
}
