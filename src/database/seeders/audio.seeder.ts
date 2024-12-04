import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseEntity, Repository } from 'typeorm';
import { faker } from '@faker-js/faker';
import { Audio } from 'src/audios/entities/audio.entity';
import { Category } from 'src/categories/entities/category.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import fs from 'fs';
import path from 'path';
import _ from 'lodash';
import { MEDIA_AVAILABILITY_TYPE } from 'src/constants';

@Injectable()
export class AudioSeeder {
  constructor(
    @InjectRepository(AudioMetadata)
    private readonly audioMetadataRepository: Repository<AudioMetadata>,
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async seed() {
    console.log(
      '###########################  AUDIO SEEDING START  ###########################',
    );

    const allAudioPath = path.join(
      process.cwd(),
      './src/database/seeders/data/audio_test_all_data.json',
    );

    const licensedAudioPath = path.join(
      process.cwd(),
      './src/database/seeders/data/audio_test_licensed_data.json',
    );

    const allRawMetaData = fs.readFileSync(allAudioPath, 'utf-8');
    const allMetadata = JSON.parse(allRawMetaData);
    const allAudioMap = {};
    for (const audio of allMetadata) {
      if (audio.audiobook === undefined) {
        console.log(audio);
        continue;
      }
      allAudioMap[audio.audiobook.id] = audio;
    }

    const rawLicensedData = fs.readFileSync(licensedAudioPath, 'utf-8');
    const licensedData = JSON.parse(rawLicensedData);

    const audioCategories = await this.categoryRepository.find();

    const audioEntities = licensedData.map((audio: any) => {
      const licensedAudioMetadata = audio.audiobook;
      console.log(licensedAudioMetadata.id);
      if (allAudioMap[licensedAudioMetadata.id] === undefined) {
        console.log(
          `Audio with id ${licensedAudioMetadata.id} not found in all data`,
        );
        return null;
      }
      const audioMetadata = allAudioMap[licensedAudioMetadata.id];
      const audiobookMetadata = audioMetadata.audiobook;
      const library = audioMetadata?.active_products?.library; // rental
      const retail = audioMetadata?.active_products?.retail; // purchase

      // audioMetadata
      const audioMeta = new AudioMetadata();
      audioMeta.sku = audiobookMetadata.id;
      audioMeta.title = audiobookMetadata.title;
      audioMeta.description = audiobookMetadata.description;
      audioMeta.abridgement = audiobookMetadata.abridgement;
      audioMeta.cover_url = audiobookMetadata.cover_url;
      audioMeta.sample_url = audiobookMetadata.sample_url;
      audioMeta.actual_size = audiobookMetadata.actual_size;
      audioMeta.publisher = audiobookMetadata.publisher;
      audioMeta.runtime = audiobookMetadata.runtime;
      audioMeta.copyright = audiobookMetadata.copyright;
      audioMeta.chapters = audiobookMetadata.chapters;
      audioMeta.sub_title = audiobookMetadata.sub_title;
      audioMeta.street_date = audiobookMetadata.street_date;
      audioMeta.modified_date = audiobookMetadata.modified_date;
      audioMeta.language = audiobookMetadata.language;
      audioMeta.authors = audiobookMetadata.authors;
      audioMeta.narrators = audiobookMetadata.narrators;
      audioMeta.bisac_codes = audiobookMetadata.bisac_codes;
      audioMeta.product_signature = audiobookMetadata.metadata_sig;
      audioMeta.isbn = library && library[0].isbn;
      audioMeta.product_id = library && library[0].id;
      audioMeta.retail_product_id = retail && retail[0].id;
      audioMeta.findaway_price = library && library[0].list_price;
      audioMeta.findaway_content_cost = library && library[0].content_cost;
      audioMeta.findaway_retail_price = retail && retail[0].list_price;
      audioMeta.findaway_retail_content_cost = retail && retail[0].content_cost;
      audioMeta.is_for_sale = library !== undefined;
      audioMeta.sales_locations = library && library[0].territories;
      audioMeta.sales_location_exclusions = null;

      // audio
      const audioEntity = new Audio();
      audioEntity.sku = audioMeta.sku;
      audioEntity.is_active = audioMeta.is_for_sale;
      audioEntity.is_excluded = !audioEntity.is_active;
      audioEntity.is_featured = Math.random() >= 0.5;
      audioEntity.available_for =
        library && retail
          ? MEDIA_AVAILABILITY_TYPE.BOTH
          : library
            ? MEDIA_AVAILABILITY_TYPE.RENTAL
            : MEDIA_AVAILABILITY_TYPE.PURCHASABLE;

      // audioMeta.is_only_for_purchase =
      //   retail !== undefined && library === undefined;

      audioEntity.trl_cost =
        audioMeta.findaway_content_cost &&
        Math.floor(audioMeta.findaway_content_cost / 10);

      audioEntity.categories = [
        audioCategories[_.random(audioCategories.length - 1)].id,
      ];
      audioEntity.suggestions = [];
      audioEntity.purchased_licenses = _.random(1, 10);
      audioEntity.purchased_license_limit =
        audioEntity.purchased_licenses + _.random(0, 5);

      return { audioMeta, audioEntity };
    });

    for (const entry of audioEntities) {
      if (entry !== null) {
        await this.audioMetadataRepository.save(entry.audioMeta);
        await this.audioRepository.save(entry.audioEntity);
      }
    }
    console.log(
      '###########################  AUDIO SEEDING END  ###########################',
    );
  }
}
