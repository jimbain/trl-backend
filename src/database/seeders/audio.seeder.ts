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
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_01.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_02.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_03.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_04.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_05.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_06.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_07.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_08.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_09.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_10.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_1.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_2.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_3.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_4.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_5.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_6.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_7.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_8.flac',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audios/9781467611145_9.flac',
    ];

    const demoImages = [
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00037.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00078.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00082.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00120.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00184.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00185.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00200.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00451.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00655.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00722.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00753.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00929.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_00930.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_01022.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_01095.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_01099.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_01105.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_01178.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_01188.png',
      'https://trl-dev.nyc3.digitaloceanspaces.com/audio-images/AudioApi_01656.png'
    ];

    const authors = [
      "J.K. Rowling",
      "George Orwell",
      "Jane Austen",
      "Mark Twain",
      "J.R.R. Tolkien",
      "Ernest Hemingway",
      "F. Scott Fitzgerald",
      "Agatha Christie",
      "Charles Dickens",
      "Leo Tolstoy"
    ];

    const audioCategories = await this.audioCategoryRepository.find({
      select: ['id'],
    });

    if (audioCategories.length === 0) {
      console.log('No audio categories found. Please seed audio categories first.');
      return;
    }

    const audioEntities = Array.from({ length: 200 }).map(() => {
      let randomCategories = faker.helpers.arrayElements(
        audioCategories.map(category => category.id),
        faker.number.int({ min: 1, max: 3 })
      );

      let numberOfAuthors = Math.floor(Math.random() * authors.length) + 1;
      let randomAuthors = [];

      while (randomAuthors.length < numberOfAuthors) {
        const randomIndex = Math.floor(Math.random() * authors.length);
        if (!randomAuthors.includes(authors[randomIndex])) {
          randomAuthors.push(authors[randomIndex]);
        }
      }

      return {
        title: faker.music.songName(),
        audio_category_ids: randomCategories,
        authors: this.getRandomAuthors(authors),
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

  getRandomAuthors(authors: string[]): string[] {
    const shouldReturnMultiple = Math.random() < 0.3; // 30% chance to return multiple authors
  
    if (shouldReturnMultiple) {
      const numberOfAuthors = Math.floor(Math.random() * (authors.length - 1)) + 2; // At least 2 authors
      const randomAuthors: string[] = [];
  
      while (randomAuthors.length < numberOfAuthors) {
        const randomIndex = Math.floor(Math.random() * authors.length);
        if (!randomAuthors.includes(authors[randomIndex])) {
          randomAuthors.push(authors[randomIndex]);
        }
      }
  
      return randomAuthors;
    } else {
      const randomIndex = Math.floor(Math.random() * authors.length);
      return [authors[randomIndex]];
    }
  }
}
