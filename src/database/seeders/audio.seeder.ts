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

    const audioMetaPath = path.join(
      process.cwd(),
      './src/database/seeders/data/audio_500_data.json',
    );

    const rawData = fs.readFileSync(audioMetaPath, 'utf-8');
    const data = JSON.parse(rawData);
    const audioCategories = await this.categoryRepository.find();

    const audioEntities = data.map((audio) => {
      const audiobook = audio.audiobook;
      const library = audio?.active_products?.library;
      const retail = audio?.active_products?.retail;

      // audioMetadata
      const audioMeta = new AudioMetadata();
      audioMeta.sku = parseInt(audiobook.id, 10);
      audioMeta.title = audiobook.title;
      audioMeta.description = audiobook.description;
      audioMeta.abridgement = audiobook.abridgement;
      audioMeta.cover_url = audiobook.cover_url;
      audioMeta.sample_url = audiobook.sample_url;
      audioMeta.actual_size = audiobook.actual_size;
      audioMeta.publisher = audiobook.publisher;
      audioMeta.runtime = audiobook.runtime;
      audioMeta.copyright = audiobook.copyright;
      audioMeta.chapters = audiobook.chapters;
      audioMeta.sub_title = audiobook.sub_title;
      audioMeta.street_date = audiobook.street_date;
      audioMeta.modified_date = audiobook.modified_date;
      audioMeta.language = audiobook.language;
      audioMeta.authors = audiobook.authors;
      audioMeta.narrators = audiobook.narrators;
      audioMeta.bisac_codes = audiobook.bisac_codes;
      audioMeta.product_signature = audiobook.metadata_sig;
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
      audioEntity.available_for = Object.values(MEDIA_AVAILABILITY_TYPE)[
        _.random(0, 2)
      ];
      audioEntity.is_active = audioMeta.is_for_sale;
      audioEntity.is_excluded = !audioEntity.is_active;
      audioEntity.is_featured = Math.random() >= 0.5;
      audioEntity.is_only_for_purchase = Math.random() >= 0.5;
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
      console.log(entry.audioMeta);
      console.log(entry.audioEntity);
      await this.audioMetadataRepository.save(entry.audioMeta);
      await this.audioRepository.save(entry.audioEntity);
    }
    console.log(
      '###########################  AUDIO SEEDING END  ###########################',
    );
  }
}
