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
    const demoAudios = [
      'https://music.wixstatic.com/preview/5ad03d_dd3f171ed29042a294c0294664c3f6af-128.mp3',
      'https://music.wixstatic.com/preview/5ad03d_545b0604bfc443608631f83c5af698b6-128.mp3',
      'https://music.wixstatic.com/preview/5ad03d_c5741c97701c43ba9723b06680da2547-128.mp3',
      'https://music.wixstatic.com/preview/5ad03d_adeb0acf30454425bc2ff4aca11d0a98-128.mp3'
    ];

    const demoImages = [
      'https://marketplace.canva.com/EAFPHUaBrFc/1/0/1003w/canva-black-and-white-modern-alone-story-book-cover-QHBKwQnsgzs.jpg',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSG7ekxu3OzvIQLn2K9bnYPHvNlHiVnR216eg&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSh6zKQpZZlZy4RnkXeMXslIklt9aZQdvLavA&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRD4-lgfczeJeYdHqM1-DWxaLnsudpE1-3xgg&s',
      'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTYjX6vLQwJ1HssgxygBWkdEtVii9GUovthsA&s'
    ];

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
        image_url:demoImages[Math.floor(Math.random() * demoImages.length)],
        url: demoAudios[Math.floor(Math.random() * demoAudios.length)],
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
