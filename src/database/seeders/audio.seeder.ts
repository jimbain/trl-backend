import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { faker } from '@faker-js/faker';
import { AudioCategory } from 'src/audio/entities/audio_category.entity';
import { Audio } from 'src/audio/entities/audio.entity';

@Injectable()
export class AudioSeeder {
  constructor(
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
    @InjectRepository(AudioCategory)
    private readonly audioCategoryRepository: Repository<AudioCategory>,
  ) {}

  async seed() {
    const audioCategories = await this.audioCategoryRepository.find({
      select: ['id'],
    });

    if (audioCategories.length === 0) {
      console.log('No audio categories found. Please seed audio categories first.');
      return;
    }

    const audioEntities = Array.from({ length: 200 }).map(() => {
      const randomCategories = faker.helpers.arrayElements(
        audioCategories.map(category => category.id),
        faker.number.int({ min: 1, max: 3 })
      );

      return {
        title: faker.music.songName(),
        audio_category_ids: randomCategories,
        rental_cost: faker.number.float({ min: 50, max: 100, precision: 0.01 }),
        bookshelf_cost: faker.number.float({ min: 100, max: 450, precision: 0.01 }),
        is_featured: faker.datatype.boolean(),
        available_for: faker.helpers.arrayElement(['rent', 'bookshelf', 'both']) as 'rent' | 'bookshelf' | 'both', 
        url: faker.internet.url(),
        is_active: faker.datatype.boolean(),
      };
    });

    for (const audioData of audioEntities) {
      const audio = this.audioRepository.create(audioData);
      await this.audioRepository.save(audio);
    }

    console.log('200 audios have been seeded');
  }
}
