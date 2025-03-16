import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Raw, Repository } from 'typeorm';
import { Audio } from './entities/audio.entity';
import { AudioService } from './audio.service';
import { AudioMetadata } from './entities/audio_metadata.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { AudioMetadataService } from './audio_metadata.service';
import {
  CATALOG_CATEGORY_TYPE,
  MEDIA,
  MEDIA_AVAILABILITY_TYPE,
} from 'src/constants';
import { ConfigService } from '@nestjs/config';
import { AudioEngineAudio } from 'src/common/interfaces';
import { Category } from 'src/categories/entities/category.entity';
import _ from 'lodash';
import { Cron } from '@nestjs/schedule';
import { Catalog } from 'src/catalog/entities/catalog.entity';

@Injectable()
export class AudioSeedService {
  private readonly audioEngineAccountId: string;
  public audioCategories: Category[];

  constructor(
    @InjectRepository(AudioMetadata)
    private readonly audioMetadataRepository: Repository<AudioMetadata>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,

    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    private readonly audioService: AudioService,
    private readonly audioMetadataService: AudioMetadataService,
    private readonly audioEngineService: AudioEngineService,
    private readonly configService: ConfigService,
  ) {
    this.audioEngineAccountId = this.configService.getOrThrow<string>(
      'AUDIO_ENGINE_ACCOUNT_ID',
    );
  }

  // UTC time 2am
  // @Cron('0 2 * * *', {
  //   name: 'audio_sync',
  // })
  async seed() {
    let currentPage = 1;
    const pageSize = 1000;
    const batchSize = 20;

    const audioCatalog = await this.catalogRepository.findOne({
      where: { type: CATALOG_CATEGORY_TYPE.DEFAULT, media_type: MEDIA.AUDIO },
    });

    if (!audioCatalog) {
      console.log(`Audio catalog missing.`);
      return;
    }

    this.audioCategories = await this.categoryRepository.find({
      where: { id: In(audioCatalog.categories ?? []) },
    });

    while (true) {
      console.log(`Fetching page ${currentPage}`);
      const response = await this.audioEngineService.get<AudioEngineAudio[]>(
        `/audiobooks?page=${currentPage}&page_size=${pageSize}`,
      );

      const audios = response; // Assuming the API returns an array of audios directly.
      console.log('Count of audioList for current page', audios.length);

      // If there are no audios, exit the loop.
      if (audios.length === 0) {
        console.log('No more audios to process. Exiting...');
        break;
      }

      // Process audios in batches
      for (let i = 0; i < audios.length; i += batchSize) {
        const batch = audios.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (audio) => {
            try {
              console.log('Processing SKU', audio.audiobook.id);
              const audioByAccount = await this.getAudioByAccount(audio);
              const audioMetadata = await this.syncAudioMetadata(
                audio,
                audioByAccount,
              );
              await this.syncAudioData(audioMetadata, audioByAccount);
            } catch (error) {
              console.error(
                `Error processing SKU ${audio.audiobook.id}: ${error.message}`,
              );
            }
          }),
        );
      }

      // Move to the next page.
      currentPage++;
    }
  }

  private async getAudioByAccount(audio: AudioEngineAudio): Promise<any> {
    if (!audio?.active_products?.library) {
      return null;
    }

    try {
      return await this.audioEngineService.get(
        `/accounts/${this.audioEngineAccountId}/audiobooks/${audio.audiobook.id}`,
      );
    } catch {
      return null;
    }
  }

  async syncAudioMetadata(
    audio: AudioEngineAudio,
    audioByAccount: any,
  ): Promise<AudioMetadata> {
    const { audiobook } = audio;
    const existingMetadata = await this.audioMetadataService.findOne(
      audiobook.id,
    );

    const payload = await this.getMetadataPayload(audio, audioByAccount);

    if (!existingMetadata) {
      return await this.audioMetadataService.create(payload);
    }

    if (existingMetadata.metadata_signature !== audiobook.metadata_sig) {
      return await this.audioMetadataService.update(
        existingMetadata.sku,
        payload,
      );
    }

    return existingMetadata;
  }

  private async getMetadataPayload(
    audio: AudioEngineAudio,
    audioByAccount: any,
  ) {
    const { audiobook, active_products } = audio;
    const library = active_products?.library?.[0];
    const retail = active_products?.retail?.[0];

    return {
      sku: audiobook.id,
      title: audiobook.title,
      authors: audiobook.authors,
      isbn: library?.isbn || null,
      publisher: audiobook.publisher,
      description: audiobook.description,
      language: audiobook.language,
      actual_size: audiobook.actual_size,
      narrators: audiobook.narrators,
      abridgement: audiobook.abridgement,
      bisac_codes: audiobook.bisac_codes,
      runtime: audiobook.runtime,
      product_id: library?.id || null,
      retail_product_id: retail?.id || null,
      metadata_signature: audiobook.metadata_sig,
      findaway_price: library?.list_price || null,
      findaway_content_cost: library?.content_cost || null,
      findaway_retail_price: retail?.list_price || null,
      findaway_retail_content_cost: retail?.content_cost || null,
      available_for:
        library && retail
          ? MEDIA_AVAILABILITY_TYPE.BOTH
          : library
            ? MEDIA_AVAILABILITY_TYPE.RENTAL
            : MEDIA_AVAILABILITY_TYPE.PURCHASABLE,
      is_for_sale: !!Object.keys(audio.active_products).length,
      sales_locations: library?.territories || null,
      retail_sales_locations: retail?.territories || null,
      copyright: audiobook.copyright,
      sample_url: audiobook.sample_url,
      cover_url: audiobook.cover_url,
      sub_title: audiobook.sub_title,
      chapters: audiobook.chapters,
      purchased_rental_licenses: audioByAccount
        ? audioByAccount.licenses.filter(
            (license: any) =>
              license.checkout_id === null &&
              license.business_model === 'library',
          ).length
        : 0,
    };
  }

  async syncAudioData(metadata: AudioMetadata, audioByAccount: any) {
    const existingAudio = await this.audioRepository.findOne({
      where: { sku: metadata.sku },
    });

    const rentedLicenses = audioByAccount
      ? audioByAccount.licenses.filter(
          (license: any) =>
            license.checkout_id !== null &&
            license.business_model === 'library',
        ).length
      : 0;

    if (existingAudio) {
      existingAudio.purchased_rental_license_limit =
        existingAudio.purchased_rental_license_limit ??
        metadata.purchased_rental_licenses;
      existingAudio.total_rented = rentedLicenses;
      await this.audioRepository.save(existingAudio);
    } else {
      const newAudio = this.createAudioEntity(metadata, rentedLicenses);
      await this.audioRepository.save(newAudio);
    }
  }

  private createAudioEntity(
    metadata: AudioMetadata,
    totalRented: number,
  ): Audio {
    const audio = new Audio();
    audio.sku = metadata.sku;
    audio.is_active = false; // metadata.is_for_sale;
    audio.is_excluded = false;
    audio.is_featured = false;
    audio.bookshelf_credit_cost = metadata.findaway_content_cost
      ? Math.floor(metadata.findaway_content_cost / 10)
      : 0;
    audio.total_rented = totalRented;
    audio.purchased_rental_license_limit = metadata.purchased_rental_licenses;
    audio.categories = [
      this.audioCategories[_.random(this.audioCategories.length - 1)].id,
    ];
    return audio;
  }
}
