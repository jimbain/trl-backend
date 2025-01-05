import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from './entities/audio.entity';
import { AudioService } from './audio.service';
import { AudioMetadata } from './entities/audio_metadata.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { AudioMetadataService } from './audio_metadata.service';
import { MEDIA_AVAILABILITY_TYPE } from 'src/constants';
import { ConfigService } from '@nestjs/config';

export interface AudioEngineAudioBook {
  id: string;
  metadata_sig: string;
  title: string;
  description: string;
  abridgement: string;
  cover_url: string;
  sample_url: string;
  actual_size: number;
  awards: string[];
  publisher: string;
  runtime: string;
  copyright: string;
  chapters: AudioEngineAudioBookChapter[];
  sub_title: string;
  series: string[];
  grade_level: string;
  street_date: string;
  modified_date: string;
  language: string;
  chapterized: boolean;
  drm_free: boolean;
  embargoed: boolean;
  authors: string[];
  narrators: string[];
  audio_updated_date: string;
  image_updated_date: string;
  metadata_updated_date: string;
  product_only_modified: string;
  promotion_only_modified: string;
  supplement_updated_date: string;
  image_etag: string | null;
  audio_version: string;
  supplements: any[];
  bisac_codes: string[];
}

export interface AudioEngineAudioBookChapter {
  part_number: number;
  chapter_number: number;
  duration: number;
  chapter_name: string;
  part_name: string | null;
  file_size: number;
  bitrate: number;
  sample_rate: number;
  format: string | null;
}

export interface AudioEngineAudio {
  audiobook: AudioEngineAudioBook;
  active_products: any;
  inactive_products: any;
  active_promotions: any;
  inactive_promotions: any;
}

@Injectable()
export class AudioSeedService {
  private readonly audioEngineAccountId: string;

  constructor(
    @InjectRepository(AudioMetadata)
    private readonly audioMetadataRepository: Repository<AudioMetadata>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    private readonly audioService: AudioService,
    private readonly audioMetadataService: AudioMetadataService,
    private readonly audioEngineService: AudioEngineService,
    private readonly configService: ConfigService,
  ) {
    this.audioEngineAccountId = this.configService.getOrThrow<string>(
      'AUDIO_ENGINE_ACCOUNT_ID',
    );
  }

  async seed() {
    const audios =
      await this.audioEngineService.get<AudioEngineAudio[]>(`/audiobooks`);
    console.log('Count of audioList', audios.length);

    for (const audio of audios) {
      console.log('SKU', audio.audiobook.id);
      const audioByAccount = await this.getAudioByAccount(audio.audiobook.id);
      if (!audioByAccount) continue;
      console.log('audioByAccount', audioByAccount);

      const audioMetadata = await this.syncAudioMetadata(audio, audioByAccount);
      await this.syncAudioData(audioMetadata, audioByAccount);
    }
  }

  private async getAudioByAccount(audioId: string): Promise<any> {
    try {
      return await this.audioEngineService.get(
        `/accounts/${this.audioEngineAccountId}/audiobooks/${audioId}`,
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
      is_for_sale: !!library,
      sales_locations: library?.territories || null,
      retail_sales_locations: retail?.territories || null,
      copyright: audiobook.copyright,
      sample_url: audiobook.sample_url,
      cover_url: audiobook.cover_url,
      sub_title: audiobook.sub_title,
      chapters: audiobook.chapters,
      purchased_rental_licenses: audioByAccount.licenses.filter(
        (license: any) =>
          license.checkout_id === null && license.business_model === 'library',
      ).length,
    };
  }

  async syncAudioData(metadata: AudioMetadata, audioByAccount: any) {
    const existingAudio = await this.audioRepository.findOne({
      where: { sku: metadata.sku },
    });

    const rentedLicenses = audioByAccount.licenses.filter(
      (license: any) =>
        license.checkout_id !== null && license.business_model === 'library',
    ).length;

    if (existingAudio) {
      existingAudio.purchased_rental_license_limit =
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
    audio.is_active = metadata.is_for_sale;
    audio.is_excluded = !audio.is_active;
    audio.is_featured = Math.random() >= 0.5;
    audio.bookshelf_credit_cost = metadata.findaway_content_cost
      ? Math.floor(metadata.findaway_content_cost / 10)
      : null;
    audio.total_rented = totalRented;
    return audio;
  }
}
