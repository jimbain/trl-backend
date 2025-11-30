import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from 'src/categories/entities/category.entity';

@Injectable()
export class CategorySeeder {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async seed() {
    console.log(
      '###########################  CATEGORY SEEDING START  ###########################',
    );

    const categories = [
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

    const categoryEntities = Array.from(categories).map((name) => ({
      name: name,
    }));

    for (const category of categoryEntities) {
      const categoryEntity = this.categoryRepository.create(category);
      await this.categoryRepository.save(categoryEntity);
    }

    console.log(
      '###########################  CATEGORY SEEDING END  ###########################',
    );
  }
}
