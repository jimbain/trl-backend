import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Audio } from './entities/audio.entity';
import { plainToInstance } from 'class-transformer';
import { AudioDto, AudioListDto } from './dto/audio.dto';
import { User } from 'src/users/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
import { CompanyCategory } from 'src/companies/entities/company_category.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { CategoryService } from 'src/categories/category.service';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { PaginatedResult, PaginationMeta } from 'src/common/interfaces';
import { TriggerAudioPlayerEventDto } from './dto/trigger_audio_player_event.dto';
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';
import { USER_MEDIA_STATUS } from 'src/constants';

@Injectable()
export class AudioService {
  @InjectRepository(Category)
  private readonly audioCategoryRepository: Repository<Category>;

  @InjectRepository(CompanyCategory)
  private readonly companyCategoryRepository: Repository<CompanyCategory>;

  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  @InjectRepository(UserAudioStatus)
  private readonly userAudioStatusRepository: Repository<UserAudioStatus>;

  @InjectRepository(UserAudioplayerPosition)
  private readonly userAudioplayerPositionRepository: Repository<UserAudioplayerPosition>;

  constructor(
    private readonly categoryService: CategoryService,
    private readonly audioEngineService: AudioEngineService,
  ) {}

  async findById(
    id: string,
    relations: string[] = [],
  ): Promise<Audio | undefined> {
    const audio = await this.audioRepository.findOne({
      where: { id: id, is_active: true },
      relations: relations.length ? relations : undefined,
    });

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${id} not found`);
    }

    return audio;
  }

  async findAllAudioCategoryIdOfCompany(companyId: string): Promise<string[]> {
    const companyAudioCategories = await this.companyCategoryRepository.find({
      where: { company_id: companyId, is_active: true },
    });

    return companyAudioCategories.map((category) => category.category_id);
  }

  async getFeaturedAudios(
    categoryIds: string[],
    user: User,
    limit: number = 10,
    page: number = 1,
  ): Promise<{
    data: AudioListDto[];
    meta: PaginationMeta;
  }> {
    const userAudios = await this.userAudioStatusRepository.find({
      where: {
        user_id: user.id,
      },
      select: ['audio_id'],
    });

    const audioIds = userAudios.map(
      (userAudio: UserAudioStatus) => userAudio.audio_id,
    );

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .where(
        `array(SELECT jsonb_array_elements_text(audio.categories)) && :categoryIds`,
        { categoryIds: categoryIds },
      )
      .andWhere('audio.is_featured = :isFeatured', { isFeatured: true })
      .andWhere('audio.is_active = :isActive', { isActive: true });

    if (audioIds.length > 0) {
      queryBuilder.andWhere('audio.id NOT IN (:...audioIds)', { audioIds });
    }

    const [audios, total] = await queryBuilder
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'audio.total_rented',
        'audio.purchased_licenses',
        'audio.available_for',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
      ])
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const from = total > 0 ? (page - 1) * limit + 1 : null;
    const to = Math.min(page * limit, total);

    return {
      data: plainToInstance(AudioListDto, audios, {
        excludeExtraneousValues: true,
      }),
      meta: {
        current_page: page,
        per_page: limit,
        total,
        last_page: Math.ceil(total / limit),
        from,
        to,
      },
    };
  }

  async getContinueListeningAudiosOfUser(
    user: User,
    limit: number = 10,
  ): Promise<AudioListDto[]> {
    const userAudioplayerPositions =
      await this.userAudioplayerPositionRepository
        .createQueryBuilder('position')
        .innerJoin(
          UserAudioStatus,
          'status',
          `position.user_id = status.user_id 
        AND position.audio_id = status.audio_id 
        AND status.status IN (:...statuses)
        AND (status.status != 'rented' OR status.rental_expire_at >= :currentDate)
        `,
          {
            statuses: ['rented', 'bookshelved'],
            currentDate: new Date(),
          },
        )
        .where('position.user_id = :userId', { userId: user.id })
        .orderBy('position.updated_at', 'DESC')
        .take(limit)
        .getMany();

    const list1AudioIds = userAudioplayerPositions.map(
      (position) => position.audio_id,
    );

    const userRentalAudioStatuses = await this.userAudioStatusRepository.find({
      where: {
        user_id: user.id,
        status: USER_MEDIA_STATUS.RENTED,
        rental_expire_at: MoreThanOrEqual(new Date()),
      },
    });

    const list2AudioIds = userRentalAudioStatuses.map(
      (status) => status.audio_id,
    );

    const missingAudioIds = list2AudioIds.filter(
      (audioId) => !list1AudioIds.includes(audioId),
    );

    const audioIds = [...list1AudioIds, ...missingAudioIds];

    if (!audioIds.length) {
      return [];
    }

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .leftJoinAndMapOne(
        'audio.userAudioStatus',
        UserAudioStatus,
        'userAudioStatus',
        'userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId',
        { userId: user.id },
      )
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .andWhere('audio.id IN (:...audioIds)', { audioIds })
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'audio.total_rented',
        'audio.purchased_licenses',
        'audio.available_for',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
        'userAudioStatus.status',
        'userAudioStatus.updated_at',
        'userAudioStatus.rental_expire_at',
      ]);

    if (limit) {
      queryBuilder.take(limit);
    }

    const audios = await queryBuilder.getMany();
    const sortedAudios = audioIds.map((id) =>
      audios.find((audio) => audio.id === id),
    );

    return plainToInstance(AudioListDto, sortedAudios, {
      excludeExtraneousValues: true,
    });
  }

  async getAudiosOfUserBasedOnStatus(
    user: User,
    status: 'queued' | 'bookshelved' | 'rented',
    limit: number = null,
  ): Promise<AudioListDto[]> {
    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .leftJoinAndMapOne(
        'audio.userAudioStatus',
        UserAudioStatus,
        'userAudioStatus',
        `userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId`,
        {
          userId: user.id,
        },
      )
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .andWhere('userAudioStatus.status = :status', { status })
      .andWhere('userAudioStatus.rental_expire_at = :rentalExpireAt', { 
        rentalExpireAt: status === 'rented' ? MoreThanOrEqual(new Date()) : null,
      })
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'audio.total_rented',
        'audio.purchased_licenses',
        'audio.available_for',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
        'userAudioStatus.status',
        'userAudioStatus.updated_at',
        'userAudioStatus.rental_expire_at',
      ]);

    if (limit) {
      queryBuilder.take(limit);
    }

    const audios = await queryBuilder.getMany();

    return plainToInstance(AudioListDto, audios, {
      excludeExtraneousValues: true,
    });
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

    return companyAudioCategories.map((companyAudioCategory) => {
      return {
        id: companyAudioCategory?.category_id ?? null,
        title:
          companyAudioCategory?.display_title ??
          companyAudioCategory?.category?.title,
        popularity: this.categoryService.getPopularity(
          companyAudioCategory?.category_id,
        ),
      };
    });
  }

  async findAudiosByCategory(
    user: User,
    categoryId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    category: { id: string; title: string };
    data: AudioListDto[];
    meta: PaginationMeta;
  }> {
    const companyAudioCategories = await this.companyCategoryRepository
      .createQueryBuilder('companyCategory')
      .leftJoinAndSelect('companyCategory.category', 'category')
      .where('companyCategory.company_id = :companyId', { companyId: user.company.id })
      .andWhere('companyCategory.is_active = :isActive', { isActive: true })
      .andWhere('category.is_active = :isActive', { isActive: true })
      .andWhere(
        categoryId !== 'category_0' ? 'category.id = :categoryId' : '1=1',
        { categoryId },
      )
      .andWhere('category.media_types @> :mediaType', {
        mediaType: '["audio"]',
      })
      .getMany();

    if (!companyAudioCategories.length) {
      throw new NotFoundException(
        `Category with ID ${categoryId} not found for your company`,
      );
    }

    const categoryIds = companyAudioCategories.map(
      (category) => category.category_id,
    );

    const [audios, total] = await this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .leftJoinAndMapOne(
        'audio.userAudioStatus',
        UserAudioStatus,
        'userAudioStatus',
        'userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId',
        { userId: user.id },
      )
      .where(
        `array(SELECT jsonb_array_elements_text(audio.categories)) && :categoryIds`,
        { categoryIds: categoryIds },
      )
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
        'userAudioStatus.status',
        'userAudioStatus.updated_at',
        'userAudioStatus.rental_expire_at',
      ])
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const from = total > 0 ? (page - 1) * limit + 1 : null;
    const to = Math.min(page * limit, total);

    return {
      category: {
        id: categoryId,
        title:
          categoryId !== 'category_0'
            ? (companyAudioCategories?.[0]?.display_title ??
              companyAudioCategories?.[0]?.category?.title)
            : 'All categories',
      },
      data: plainToInstance(AudioListDto, audios, {
        excludeExtraneousValues: true,
      }),
      meta: {
        current_page: page,
        per_page: limit,
        total,
        last_page: Math.ceil(total / limit),
        from,
        to,
      },
    };
  }

  async searchAudios(
    user: User,
    query: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<AudioListDto>> {
    const categories = await this.findAllAudioCategoryIdOfCompany(
      user.company.id,
    );

    const [audios, total] = await this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .leftJoinAndMapOne(
        'audio.userAudioStatus',
        UserAudioStatus,
        'userAudioStatus',
        'userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId',
        { userId: user.id },
      )
      .where(
        `array(SELECT jsonb_array_elements_text(audio.categories)) && :categoryIds`,
        { categoryIds: categories },
      )
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .andWhere(
        new Brackets((qb) => {
          qb.where('audio.display_title ILIKE :query')
            .orWhere('metadata.title ILIKE :query')
            .orWhere('metadata.description ILIKE :query')
            .orWhere(
              `EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(audio.display_authors) elem
                WHERE elem ILIKE :query
              )`,
            )
            .orWhere(
              `EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(metadata.authors) elem
                WHERE elem ILIKE :query
              )`,
            );
        }),
        { query: `%${query}%` },
      )
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
        'userAudioStatus.status',
        'userAudioStatus.updated_at',
        'userAudioStatus.rental_expire_at',
      ])
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const from = total > 0 ? (page - 1) * limit + 1 : null;
    const to = Math.min(page * limit, total);

    return {
      data: plainToInstance(AudioListDto, audios, {
        excludeExtraneousValues: true,
      }),
      meta: {
        current_page: page,
        per_page: limit,
        total,
        last_page: Math.ceil(total / limit),
        from,
        to,
      },
    };
  }

  async findAudioById(id: string, user: User | null): Promise<AudioDto> {
    const audio = await this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .where('audio.id = :id', { id })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .getOne();

    const userAudio = await this.userAudioStatusRepository.findOne({
      where: { user_id: user.id, audio_id: id },
      select: ['status', 'rental_expire_at'],
    });

    return plainToInstance(
      AudioDto,
      {
        ...audio,
        ...{
          status: userAudio?.status ?? null,
          rental_expires_at: userAudio?.rental_expire_at ?? null,
        },
      },
      { excludeExtraneousValues: true },
    );
  }

  async findAudioPlaylist(audioId: string, user: User) {
    const audio = await this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .where('audio.id = :id', { id: audioId })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .getOne();

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${audioId} not found`);
    }

    const userAudioStatus = await this.userAudioStatusRepository.findOne({
      where: {
        audio_id: audio.id,
        user_id: user.id,
        status: In(['rented', 'bookshelved']),
      },
    });

    if (!userAudioStatus) {
      throw new BadRequestException(
        `Need to rent or bookself the audio for getting playlist.`,
      );
    }

    const userAudioPosition =
      await this.userAudioplayerPositionRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      });

    const sku = audio.sku;
    const data: any = await this.audioEngineService.post(
      `/audiobooks/${sku}/playlists`,
      { license_id: userAudioStatus.license_id },
      { 'Session-key': await this.audioEngineService.getSessionKey() },
      true,
    );

    return {
      audio_metadata: plainToInstance(AudioListDto, audio, {
        excludeExtraneousValues: true,
      }),
      audio_player_data: userAudioPosition
        ? {
            chapter_number: userAudioPosition.chapter_number,
            part_number: userAudioPosition.part_number,
            play_position: userAudioPosition.play_position,
          }
        : null,
      ...data,
    };
  }

  async triggerAudioPlayerEvent(
    audioId: string,
    payload: TriggerAudioPlayerEventDto,
    user: User,
  ) {
    const existingUserAudioPosition =
      await this.userAudioplayerPositionRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      });

    const updatedUserAudioplayerPosition = existingUserAudioPosition
      ? {
          ...existingUserAudioPosition,
          part_number: payload.part_number,
          chapter_number: payload.chapter_number,
          play_position: payload.play_position,
          updated_at: new Date(),
        }
      : this.userAudioplayerPositionRepository.create({
          user_id: user.id,
          audio_id: audioId,
          part_number: payload.part_number,
          chapter_number: payload.chapter_number,
          play_position: payload.play_position,
          updated_at: new Date(),
        });

    return await this.userAudioplayerPositionRepository.save(
      updatedUserAudioplayerPosition,
    );
  }
}
