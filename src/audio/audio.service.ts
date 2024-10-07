import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AudioCategory } from 'src/audio/entities/audio_category.entity';
import { In, Repository } from 'typeorm';
import { CompanyAudioCategory } from 'src/company/entities/company_audio_category.entity';
import { Audio } from './entities/audio.entity';
import { plainToInstance } from 'class-transformer';
import { AudioDto, AudioListDto } from './dto/audio.dto';
import { UserAudio } from 'src/user/entities/user_audio.entity';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class AudioService {
  @InjectRepository(AudioCategory)
  private readonly audioCategoryRepository: Repository<AudioCategory>;

  @InjectRepository(CompanyAudioCategory)
  private readonly companyAudioCategoryRepository: Repository<CompanyAudioCategory>;

  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  @InjectRepository(UserAudio)
  private readonly userAudioRepository: Repository<UserAudio>;

  async findById(
    id: string,
    relations: string[] = [],
  ): Promise<Audio | undefined> {
    const audio = await this.audioRepository.findOne({
      where: { id },
      relations: relations.length ? relations : undefined,
    });
    console.log('AudioService', audio);
    if (!audio) {
      throw new NotFoundException(`Audio with ID ${id} not found`);
    }

    return audio;
  }

  async findAllAudioCategoryIdOfCompany(companyId: string): Promise<string[]> {
    const companyAudioCategories =
      await this.companyAudioCategoryRepository.find({
        where: { company_id: companyId },
      });
    return companyAudioCategories.map((category) => category.audio_category_id);
  }

  async findAllFeaturedAudios(
    audioCategoryIds: string[],
  ): Promise<AudioListDto[]> {
    const featuredAudios = await this.audioRepository
      .createQueryBuilder('audio')
      .where(
        `array(SELECT jsonb_array_elements_text(audio.audio_category_ids)) && :categoryIds`,
        { categoryIds: audioCategoryIds },
      )
      .andWhere('audio.is_featured = :isFeatured', { isFeatured: true })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .select([
        'audio.id',
        'audio.title',
        'audio.image_url',
        'audio.authors',
        'audio.average_review_rating',
      ])
      .getMany();

    return plainToInstance(AudioListDto, featuredAudios, {
      excludeExtraneousValues: true,
    });
  }

  async findAudiosOfUserBasedOnStatus(
    user: User,
    status: 'queued' | 'bookshelved',
  ): Promise<AudioListDto[]> {
    const userAudios = await this.userAudioRepository.find({
      where: { user_id: user.id, status: status },
      select: ['audio_id'],
    });

    const audioIds = userAudios.map((userAudio) => userAudio.audio_id);

    if (audioIds.length === 0) {
      return [];
    }

    const audios = await this.audioRepository.find({
      where: { id: In(audioIds) },
      select: ['id', 'title', 'image_url', 'authors', 'average_review_rating'],
    });

    return plainToInstance(AudioListDto, audios, {
      excludeExtraneousValues: true,
    });
  }

  async findAllAudioCategoriesForCompany(companyId: string) {
    const companyAudioCategories =
      await this.companyAudioCategoryRepository.find({
        where: { company_id: companyId },
        select: ['audio_category_id', 'title'],
      });

    const audioCategoryIdsWithNullTitle = companyAudioCategories
      .filter((cac) => cac.title === null)
      .map((cac) => cac.audio_category_id);

    let audioCategoriesMap = new Map<string, string>();

    if (audioCategoryIdsWithNullTitle.length > 0) {
      const audioCategories = await this.audioCategoryRepository.find({
        where: { id: In(audioCategoryIdsWithNullTitle) },
        select: ['id', 'title'],
      });

      audioCategoriesMap = new Map(
        audioCategories.map((ac) => [ac.id, ac.title]),
      );
    }

    const result = companyAudioCategories.map((companyAudioCategory) => {
      const audioCategoryId = companyAudioCategory.audio_category_id;
      const title =
        companyAudioCategory.title ?? audioCategoriesMap.get(audioCategoryId);
      return {
        id: audioCategoryId,
        title,
        popularity: companyAudioCategory.popularity,
      };
    });

    return result;
  }

  async findAudiosByCategory(
    companyId: string,
    categoryId: string,
  ): Promise<AudioListDto[]> {
    const companyAudioCategory =
      await this.companyAudioCategoryRepository.findOne({
        where: { company_id: companyId, audio_category_id: categoryId },
      });

    if (!companyAudioCategory) {
      throw new NotFoundException(
        `Audio category with ID ${categoryId} not found for your company`,
      );
    }

    const audios = await this.audioRepository
      .createQueryBuilder('audio')
      .where('audio.audio_category_ids @> :categoryId::jsonb', {
        categoryId: JSON.stringify([categoryId]),
      })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .select(['audio.id', 'audio.title', 'audio.authors', 'audio.image_url'])
      .getMany();

    return plainToInstance(AudioListDto, audios, {
      excludeExtraneousValues: true,
    });
  }

  async findAudioById(id: string, user: User | null): Promise<AudioDto> {
    const audio = await this.findById(id);

    let status = null;

    const userAudio = await this.userAudioRepository.findOne({
      where: { user_id: user.id, audio_id: id },
      select: ['status'],
    });

    if (userAudio) {
      status = userAudio.status;
    }

    return plainToInstance(
      AudioDto,
      { ...audio, ...{ status: status } },
      { excludeExtraneousValues: true },
    );
  }
}
