import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Audio } from './entities/audio.entity';
import { plainToInstance } from 'class-transformer';
import { AudioDto, AudioListDto } from './dto/audio.dto';
import { User } from 'src/users/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
import { CompanyCategory } from 'src/companies/entities/company_category.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { CategoryService } from 'src/categories/category.service';

@Injectable()
export class AudioService {
  @InjectRepository(Category)
  private readonly audioCategoryRepository: Repository<Category>;

  @InjectRepository(CompanyCategory)
  private readonly companyCategoryRepository: Repository<CompanyCategory>;

  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  @InjectRepository(UserAudioStatus)
  private readonly userAudioRepository: Repository<UserAudioStatus>;

  private readonly categoryService: CategoryService;

  async findById(
    id: string,
    relations: string[] = [],
  ): Promise<Audio | undefined> {
    const audio = await this.audioRepository.findOne({
      where: { id },
      relations: relations.length ? relations : undefined,
    });

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${id} not found`);
    }

    return audio;
  }

  async findAllAudioCategoryIdOfCompany(companyId: string): Promise<string[]> {
    return [];
    // const companyAudioCategories =
    //   await this.companyAudioCategoryRepository.find({
    //     where: { company_id: companyId },
    //   });
    // return companyAudioCategories.map((category) => category.audio_category_id);
  }

  async findAllFeaturedAudios(
    audioCategoryIds: string[],
  ): Promise<AudioListDto[]> {
    return [];
    // const featuredAudios = await this.audioRepository
    //   .createQueryBuilder('audio')
    //   .where(
    //     `array(SELECT jsonb_array_elements_text(audio.audio_category_ids)) && :categoryIds`,
    //     { categoryIds: audioCategoryIds },
    //   )
    //   .andWhere('audio.is_featured = :isFeatured', { isFeatured: true })
    //   .andWhere('audio.is_active = :isActive', { isActive: true })
    //   .select([
    //     'audio.id',
    //     'audio.title',
    //     'audio.image_url',
    //     'audio.authors',
    //     'audio.average_review_rating',
    //   ])
    //   .getMany();

    // return plainToInstance(AudioListDto, featuredAudios, {
    //   excludeExtraneousValues: true,
    // });
  }

  async findAudiosOfUserBasedOnStatus(
    user: User,
    status: 'queued' | 'bookshelved',
  ): Promise<AudioListDto[]> {
    return [];
    // const userAudios = await this.userAudioRepository.find({
    //   where: { user_id: user.id, status: status },
    //   select: ['audio_id'],
    // });

    // const audioIds = userAudios.map((userAudio) => userAudio.audio_id);

    // if (audioIds.length === 0) {
    //   return [];
    // }

    // const audios = await this.audioRepository.find({
    //   where: { id: In(audioIds) },
    //   select: ['id', 'title', 'image_url', 'authors', 'average_review_rating'],
    // });

    // return plainToInstance(AudioListDto, audios, {
    //   excludeExtraneousValues: true,
    // });
  }

  async findAllAudioCategoriesForCompany(companyId: string) {
    const companyAudioCategories = await this.companyCategoryRepository
      .createQueryBuilder('companyCategory')
      .leftJoinAndSelect('companyCategory.category', 'category')
      .where('companyCategory.company_id = :companyId', { companyId })
      .andWhere('companyCategory.is_active = :isActive', { isActive: true })
      .andWhere('category.is_active = :isActive', { isActive: true })
      .andWhere('category.media_types @> :mediaType', {
        mediaType: '["audio"]',
      })
      .getMany();

    // this.categoryService.getPopularity(companyAudioCategory?.category_id)
    return companyAudioCategories.map((companyAudioCategory) => {
      return {
        id: companyAudioCategory?.category_id ?? null,
        title:
          companyAudioCategory?.display_title ??
          companyAudioCategory?.category?.title,
        popularity: 0,
      };
    });
  }

  async findAudiosByCategory(companyId: string, categoryId: string) {
    const companyAudioCategory = await this.companyCategoryRepository
      .createQueryBuilder('companyCategory')
      .leftJoinAndSelect('companyCategory.category', 'category')
      .where('companyCategory.company_id = :companyId', { companyId })
      .andWhere('companyCategory.is_active = :isActive', { isActive: true })
      .andWhere('category.is_active = :isActive', { isActive: true })
      .andWhere('category.id = :categoryId', { categoryId })
      .andWhere('category.media_types @> :mediaType', {
        mediaType: '["audio"]',
      })
      .getOne();

    if (!companyAudioCategory) {
      throw new NotFoundException(
        `Category with ID ${categoryId} not found for your company`,
      );
    }

    const audios = await this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .where('audio.categories @> :categoryId::jsonb', {
        categoryId: JSON.stringify([categoryId]),
      })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
      ])
      .getMany();

    return {
      category: {
        id: categoryId,
        title:
          companyAudioCategory?.display_title ??
          companyAudioCategory?.category?.title,
      },
      data: audios.map((audio) => {
        return {
          id: audio?.id ?? null,
          title: audio?.display_title ?? audio?.metadata?.title ?? null,
          authors: audio?.display_authors ?? audio?.metadata?.authors ?? [],
          image_url: audio?.metadata?.cover_url ?? null,
          avg_rating: audio?.avg_rating ?? null,
        };
      }),
    };
  }

  async findAudioById(id: string, user: User | null): Promise<AudioDto> {
    const audio = await this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .where('audio.id = :id', { id })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .getOne();

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
