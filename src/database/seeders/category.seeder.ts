import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { faker } from '@faker-js/faker';
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

    const audioCategories = new Set<string>(); // To ensure unique names

    while (audioCategories.size < 100) {
      audioCategories.add(faker.internet.domainWord());
    }

    const audioCategoryEntities = Array.from(audioCategories).map((name) => ({
      title: faker.music.genre(),
      name: name,
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
