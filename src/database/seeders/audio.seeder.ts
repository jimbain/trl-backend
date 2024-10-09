import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { faker } from '@faker-js/faker';
import { AudioCategory } from 'src/audios/entities/audio_metadata.entity';
import { Audio } from 'src/audios/entities/audio.entity';

@Injectable()
export class AudioSeeder {
  constructor(
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
    @InjectRepository(AudioCategory)
    private readonly audioCategoryRepository: Repository<AudioCategory>,
  ) {}

  async seed() {
    console.log(
      '###########################  AUDIO SEEDING START  ###########################',
    );

    const AUDIO_COUNT = 1000;

    const demoAudios = [
      'audios/9781467611145_01.flac',
      'audios/9781467611145_02.flac',
      'audios/9781467611145_03.flac',
      'audios/9781467611145_04.flac',
      'audios/9781467611145_05.flac',
      'audios/9781467611145_06.flac',
      'audios/9781467611145_07.flac',
      'audios/9781467611145_08.flac',
      'audios/9781467611145_09.flac',
      'audios/9781467611145_10.flac',
      'audios/9781467611145_1.flac',
      'audios/9781467611145_2.flac',
      'audios/9781467611145_3.flac',
      'audios/9781467611145_4.flac',
      'audios/9781467611145_5.flac',
      'audios/9781467611145_6.flac',
      'audios/9781467611145_7.flac',
      'audios/9781467611145_8.flac',
      'audios/9781467611145_9.flac',
    ];

    const demoImages = [
      'audio-images/AudioApi_00037.png',
      'audio-images/AudioApi_00078.png',
      'audio-images/AudioApi_00082.png',
      'audio-images/AudioApi_00120.png',
      'audio-images/AudioApi_00184.png',
      'audio-images/AudioApi_00185.png',
      'audio-images/AudioApi_00200.png',
      'audio-images/AudioApi_00451.png',
      'audio-images/AudioApi_00655.png',
      'audio-images/AudioApi_00722.png',
      'audio-images/AudioApi_00753.png',
      'audio-images/AudioApi_00929.png',
      'audio-images/AudioApi_00930.png',
      'audio-images/AudioApi_01022.png',
      'audio-images/AudioApi_01095.png',
      'audio-images/AudioApi_01099.png',
      'audio-images/AudioApi_01105.png',
      'audio-images/AudioApi_01178.png',
      'audio-images/AudioApi_01188.png',
      'audio-images/AudioApi_01656.png',
    ];

    const authors = [
      'J.K. Rowling',
      'George Orwell',
      'Jane Austen',
      'Mark Twain',
      'J.R.R. Tolkien',
      'Ernest Hemingway',
      'F. Scott Fitzgerald',
      'Agatha Christie',
      'Charles Dickens',
      'Leo Tolstoy',
    ];

    const audioCategories = await this.audioCategoryRepository.find({
      select: ['id'],
    });

    if (audioCategories.length === 0) {
      console.log(
        'No audio categories found. Please seed audio categories first.',
      );
      return;
    }

    const audioEntities = Array.from({ length: AUDIO_COUNT }).map(() => {
      const randomCategories = faker.helpers.arrayElements(
        audioCategories.map((category) => category.id),
        faker.number.int({ min: 1, max: 3 }),
      );

      const numberOfAuthors = Math.floor(Math.random() * authors.length) + 1;
      const randomAuthors = [];

      while (randomAuthors.length < numberOfAuthors) {
        const randomIndex = Math.floor(Math.random() * authors.length);
        if (!randomAuthors.includes(authors[randomIndex])) {
          randomAuthors.push(authors[randomIndex]);
        }
      }

      return {
        title: faker.music.songName(),
        description: faker.lorem.sentence(),
        audio_category_ids: randomCategories,
        language: faker.helpers.arrayElement([
          'English',
          'Spanish',
          'French',
          'German',
          'Chinese',
        ]) as 'English' | 'Spanish' | 'French' | 'German' | 'Chinese', // Random language
        publisher: faker.person.fullName(),
        copyright: faker.date.anytime(),
        authors: this.getRandomAuthors(authors),
        rental_cost: faker.number.float({ min: 50, max: 100, precision: 0.01 }),
        bookshelf_cost: faker.number.float({
          min: 100,
          max: 450,
          precision: 0.01,
        }),
        rental_credit: faker.number.int({ min: 50, max: 1000 }),
        bookshelf_credit: faker.number.int({ min: 100, max: 450 }),
        duration: faker.number.int({ min: 100, max: 1000 }),
        is_featured: faker.datatype.boolean(),
        available_for: faker.helpers.arrayElement([
          'rent',
          'bookshelf',
          'both',
        ]) as 'rent' | 'bookshelf' | 'both',
        image_url: demoImages[Math.floor(Math.random() * demoImages.length)],
        audio_urls: this.getRandomAudioUrls(demoAudios),
        is_active: faker.datatype.boolean(),
      };
    });

    for (const audioData of audioEntities) {
      const audio = this.audioRepository.create(audioData);
      await this.audioRepository.save(audio);
    }

    console.log(
      '###########################  AUDIO SEEDING END  ###########################',
    );
  }

  getRandomAuthors(authors: string[]): string[] {
    const shouldReturnMultiple = Math.random() < 0.3; // 30% chance to return multiple authors

    if (shouldReturnMultiple) {
      const numberOfAuthors =
        Math.floor(Math.random() * (authors.length - 1)) + 2; // At least 2 authors
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

  getRandomAudioUrls(demoAudios: string[]): string[] {
    const shouldReturnMultiple = Math.random() < 0.3; // 30% chance to return multiple audio URLs
    if (shouldReturnMultiple) {
      const numberOfUrls = faker.number.int({ min: 2, max: 5 });
      return faker.helpers.arrayElements(demoAudios, numberOfUrls);
    } else {
      return [faker.helpers.arrayElement(demoAudios)];
    }
  }
}
