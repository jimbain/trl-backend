import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  FindOptionsSelect,
  In,
  IsNull,
  MoreThanOrEqual,
  Raw,
  Repository,
} from 'typeorm';
import { Audio } from './entities/audio.entity';
import { plainToInstance } from 'class-transformer';
import {
  AudioDto,
  AudioListDto,
  applyConfigRestriction,
} from './dto/audio.dto';
import { User } from 'src/users/entities/user.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { PaginatedResult, PaginationMeta } from 'src/common/interfaces';
import { TriggerAudioPlayerEventDto } from './dto/trigger_audio_player_event.dto';
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';
import { MEDIA, USER_ACTIVITY, USER_MEDIA_STATUS } from 'src/constants';
import { AppConfigService } from 'src/app-config/app-config.service';
import { UserActivityLogService } from 'src/users/user-activity-log.service';
import { CompanyService } from 'src/companies/company.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { CategoryService } from 'src/categories/category.service';
import { Category } from 'src/categories/entities/category.entity';
import { AudioCategoryDto } from 'src/categories/dto/category.dto';
import { CacheService } from 'src/common/services/cache.service';
import { QueryAudioDto } from './dto/query-audio.dto';
import { paginate } from 'src/common/helpers/pagination.helper';
import { AudioChapter } from './entities/audio_metadata.entity';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { CacheKeys } from 'src/common/constants/cache-keys.constant';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);

  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  @InjectRepository(UserAudioStatus)
  private readonly userAudioStatusRepository: Repository<UserAudioStatus>;

  @InjectRepository(UserAudioplayerPosition)
  private readonly userAudioplayerPositionRepository: Repository<UserAudioplayerPosition>;

  @InjectRepository(UserActivityLog)
  private readonly userActivityLogRepository: Repository<UserActivityLog>;

  constructor(
    private readonly companyService: CompanyService,
    private readonly catalogService: CatalogService,
    private readonly categoryService: CategoryService,
    private readonly userActivityLogService: UserActivityLogService,
    private readonly audioEngineService: AudioEngineService,
    private readonly appConfigService: AppConfigService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Adds a WHERE clause to filter audios based on company config restriction.
   * Only includes audios where the intersection of metadata.available_for and config is not null.
   *
   * @param queryBuilder - The query builder to modify
   * @param configAction - The company config value: 'rent' | 'bookshelf' | 'both'
   * @param metadataAlias - The alias for the metadata table in the query (default: 'metadata')
   */
  private addConfigRestrictionFilter(
    queryBuilder: any,
    configAction: 'rent' | 'bookshelf' | 'both' | undefined,
    metadataAlias: string = 'metadata',
  ): void {
    if (!configAction) {
      return;
    }

    // Rent is possible when metadata allows rental, the title isn't flagged
    // purchase-only, and the effective rental-license cap exceeds total_rented.
    // Effective cap = audio.purchased_rental_license_limit when it's set
    // (positive); otherwise (NULL or 0 = unset) it falls back to the Findaway
    // metadata.purchased_rental_licenses count.
    const rentPossible =
      `(${metadataAlias}.available_for IN (:...rentAvailableFor)` +
      ` AND audio.is_only_for_purchase != true` +
      ` AND (` +
      `   (audio.purchased_rental_license_limit > 0 AND audio.purchased_rental_license_limit > audio.total_rented)` +
      `   OR ((audio.purchased_rental_license_limit IS NULL OR audio.purchased_rental_license_limit = 0) AND ${metadataAlias}.purchased_rental_licenses > audio.total_rented)` +
      ` ))`;
    const rentParams = { rentAvailableFor: ['rental', 'both'] };

    // Bookshelf is possible whenever metadata allows purchase.
    const bookshelfPossible = `${metadataAlias}.available_for IN (:...bookshelfAvailableFor)`;
    const bookshelfParams = { bookshelfAvailableFor: ['purchasable', 'both'] };

    if (configAction === 'rent') {
      queryBuilder.andWhere(rentPossible, rentParams);
    } else if (configAction === 'bookshelf') {
      queryBuilder.andWhere(bookshelfPossible, bookshelfParams);
    } else if (configAction === 'both') {
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where(rentPossible, rentParams).orWhere(
            bookshelfPossible,
            bookshelfParams,
          );
        }),
      );
    }
  }

  /**
   * Adds a WHERE clause to filter audios based on active status OR user ownership.
   *
   * When statusFilter is provided (e.g., 'queued', 'bookshelved', 'rented'):
   * - Shows active audios with that status OR
   * - Shows inactive audios if user has that specific status
   * (Used by getAudiosOfUserBasedOnStatus to maintain status-based filtering)
   *
   * When statusFilter is NOT provided:
   * - Shows all active audios OR
   * - Shows inactive audios if user has bookshelved them OR
   * - Shows inactive audios if user has an active rental
   * (Used by getContinueListeningAudiosOfUser and findAudioPlaylist)
   *
   * @param queryBuilder - The query builder to modify
   * @param userId - The user ID to check ownership
   * @param statusFilter - Optional: specific status to filter by. If provided, only allows that status for inactive audios
   * @param userAudioStatusAlias - The alias for the UserAudioStatus table in the query (default: 'userAudioStatus')
   */
  private addIsActiveOrUserOwnsFilter(
    queryBuilder: any,
    userId: string,
    statusFilter?: 'queued' | 'bookshelved' | 'rented',
    userAudioStatusAlias: string = 'userAudioStatus',
  ): void {
    queryBuilder.andWhere(
      new Brackets((qb) => {
        qb.where('audio.is_active = :isActive', { isActive: true });

        if (statusFilter) {
          // When filtering by a specific status, only show inactive audios with that status
          qb.orWhere(
            `(${userAudioStatusAlias}.user_id = :userId AND ${userAudioStatusAlias}.status = :statusFilter)`,
            {
              userId,
              statusFilter,
            },
          );
        } else {
          // When no status filter, allow all owned content (bookshelved or active rentals)
          qb.orWhere(
            `(${userAudioStatusAlias}.user_id = :userId AND ${userAudioStatusAlias}.status = :bookshelvedStatus)`,
            {
              userId,
              bookshelvedStatus: USER_MEDIA_STATUS.BOOKSHELVED,
            },
          ).orWhere(
            `(${userAudioStatusAlias}.user_id = :userId AND ${userAudioStatusAlias}.status = :rentedStatus AND ${userAudioStatusAlias}.rental_expire_at >= :currentDate)`,
            {
              userId,
              rentedStatus: USER_MEDIA_STATUS.RENTED,
              currentDate: new Date(),
            },
          );
        }
      }),
    );
  }

  async findAll(
    user: User,
    query: QueryAudioDto = {},
  ): Promise<{
    data: AudioListDto[];
    meta: PaginationMeta;
  }> {
    const { page, per_page, ids } = query;

    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    const companyAudioCategoryIds = company.category_ids.audio;
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
      .where(
        `array(SELECT jsonb_array_elements_text(audio.categories)) && :categoryIds`,
        { categoryIds: companyAudioCategoryIds },
      )
      .leftJoinAndMapOne(
        'audio.userAudioStatus',
        UserAudioStatus,
        'userAudioStatus',
        'userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId',
        { userId: user.id },
      )
      .andWhere('audio.is_active = :isActive', { isActive: true });

    // Add config-based filtering
    this.addConfigRestrictionFilter(
      queryBuilder,
      appConfigs.available_audio_title_user_action as
        | 'rent'
        | 'bookshelf'
        | 'both'
        | undefined,
    );

    queryBuilder.select([
      'audio.id AS id',
      'audio.display_title AS title',
      'audio.display_authors AS authors',
      'metadata.cover_url AS image_url',
      'audio.avg_rating AS avg_rating',
      'audio.total_rented AS total_rented',
      'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
      'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
      'audio.is_only_for_purchase AS is_only_for_purchase',
      'metadata.available_for as available_for',
      'metadata.chapters AS chapters',
      'userAudioStatus.updated_at AS updated_at',
      'userAudioStatus.status AS status',
      'userAudioStatus.rental_expire_at AS rental_expires_at',
      'userAudioStatus.audio_id AS audio_id',
      'userAudioStatus.list_order AS list_order',
    ]);

    if (ids?.length > 0) {
      queryBuilder.andWhere('audio.id IN (:...audioIds)', {
        audioIds: ids,
      });
    }

    const paginatedData = await paginate(queryBuilder, page, per_page);

    paginatedData.data = paginatedData.data.map((audio) =>
      plainToInstance(
        AudioListDto,
        {
          ...audio,
          rental_credit_cost: appConfigs.audio_rental_credit_cost,
          available_audio_title_user_action:
            appConfigs.available_audio_title_user_action,
        },
        { excludeExtraneousValues: true },
      ),
    );

    return paginatedData;
  }

  async findById(
    id: string,
    relations: string[] = [],
    userId?: string,
  ): Promise<Audio | undefined> {
    let query = this.audioRepository
      .createQueryBuilder('audio')
      .where('audio.id = :id', { id });

    // If no userId provided, only show active audios
    // If userId provided, also allow inactive audios if user owns them (bookshelved or active rental)
    if (!userId) {
      query = query.andWhere('audio.is_active = :isActive', { isActive: true });
    } else {
      // Show active audios OR audios user has bookshelved OR audios user has active rental for
      query = query
        .leftJoinAndMapOne(
          'audio.userAudioStatus',
          UserAudioStatus,
          'userAudioStatus',
          'userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId',
          { userId },
        )
        .andWhere(
          new Brackets((qb) => {
            qb.where('audio.is_active = :isActive', { isActive: true })
              .orWhere(
                '(userAudioStatus.user_id = :userId AND userAudioStatus.status = :bookshelvedStatus)',
                {
                  userId,
                  bookshelvedStatus: USER_MEDIA_STATUS.BOOKSHELVED,
                },
              )
              .orWhere(
                '(userAudioStatus.user_id = :userId AND userAudioStatus.status = :rentedStatus AND userAudioStatus.rental_expire_at >= :currentDate)',
                {
                  userId,
                  rentedStatus: USER_MEDIA_STATUS.RENTED,
                  currentDate: new Date(),
                },
              );
          }),
        );
    }

    if (relations.length) {
      relations.forEach((relation) => {
        query = query.leftJoinAndSelect(`audio.${relation}`, relation);
      });
    }

    const audio = await query.getOne();

    if (!audio) {
      throw new NotFoundException('Audio not found.');
    }

    return audio;
  }

  async findByIdWithCache(id: string, userId?: string) {
    // Only use cache for active audios (no user-specific access)
    // User-specific access (owned deactivated audios) skips cache
    if (!userId) {
      const cachedAudio = await this.cacheService.get(id);
      if (cachedAudio) return cachedAudio;
    }

    const audio = await this.findById(id, ['metadata'], userId);

    // Only cache if no user-specific access
    if (!userId) {
      await this.cacheService.set(id, audio);
    }

    return audio;
  }

  // Resolve a user-facing title following the project convention:
  // admin-overridable display_title first, then the Inaudio metadata title.
  // Returns null when both are unset so the caller can apply its own fallback.
  resolveTitle(audio: {
    display_title?: string | null;
    metadata?: { title?: string | null } | null;
  }): string | null {
    if (audio.display_title && audio.display_title.trim() !== '') {
      return audio.display_title;
    }
    const metaTitle = audio.metadata?.title;
    if (metaTitle && metaTitle.trim() !== '') {
      return metaTitle;
    }
    return null;
  }

  // Lightweight title-only lookup that ignores is_active — safe for use in
  // error messages where the entity may be deactivated but still referenced
  // by user state (e.g. a queued audio the admin later deactivated).
  async getTitleById(id: string): Promise<string | null> {
    const audio = await this.audioRepository
      .createQueryBuilder('audio')
      .leftJoin('audio.metadata', 'metadata')
      .select([
        'audio.id',
        'audio.sku',
        'audio.display_title',
        'metadata.sku',
        'metadata.title',
      ])
      .where('audio.id = :id', { id })
      .getOne();
    return audio ? this.resolveTitle(audio) : null;
  }

  async findAllAudioCategoryIdOfCompany(companyId: string): Promise<string[]> {
    const company = await this.companyService.findByIdWithCache(companyId);
    return company.category_ids.audio;
  }

  async getFeaturedAudios(
    company: any,
    user: User,
    limit: number = 10,
    page: number = 1,
  ): Promise<{
    data: AudioListDto[];
    meta: PaginationMeta;
  }> {
    const categoryIds = company.category_ids.audio;

    const [appConfigs, userAudios] = await Promise.all([
      this.appConfigService.getCompanyConfig(company.app_configs),
      this.userAudioStatusRepository.find({
        where: [
          {
            user_id: user.id,
            rental_expire_at: IsNull(),
          },
          {
            user_id: user.id,
            rental_expire_at: MoreThanOrEqual(new Date()),
          },
        ],
        select: ['audio_id'],
      }),
    ]);

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

    // Add config-based filtering
    this.addConfigRestrictionFilter(
      queryBuilder,
      appConfigs.available_audio_title_user_action as
        | 'rent'
        | 'bookshelf'
        | 'both'
        | undefined,
    );

    queryBuilder.select([
      'audio.id AS id',
      'audio.display_title AS title',
      'audio.display_authors AS authors',
      'metadata.cover_url AS image_url',
      'audio.avg_rating AS avg_rating',
      'audio.total_rented AS total_rented',
      'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
      'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
      'audio.is_only_for_purchase AS is_only_for_purchase',
      'metadata.available_for as available_for',
      'metadata.chapters AS chapters',
    ]);

    if (audioIds.length > 0) {
      queryBuilder.andWhere('audio.id NOT IN (:...audioIds)', { audioIds });
    }

    const paginatedData = await paginate(queryBuilder, page, limit);

    paginatedData.data = paginatedData.data.map((audio) =>
      plainToInstance(
        AudioListDto,
        {
          ...audio,
          rental_credit_cost: appConfigs.audio_rental_credit_cost,
          available_audio_title_user_action:
            appConfigs.available_audio_title_user_action,
        },
        { excludeExtraneousValues: true },
      ),
    );

    return paginatedData;
  }

  async getPopularAudios(company: any, user: User): Promise<AudioListDto[]> {
    const categoryIds = company.category_ids.audio;
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

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
      .where(
        `array(SELECT jsonb_array_elements_text(audio.categories)) && :categoryIds`,
        { categoryIds: categoryIds },
      )
      .andWhere('audio.total_played > 0')
      .andWhere('audio.is_active = :isActive', { isActive: true });

    // Add config-based filtering
    this.addConfigRestrictionFilter(
      queryBuilder,
      appConfigs.available_audio_title_user_action as
        | 'rent'
        | 'bookshelf'
        | 'both'
        | undefined,
    );

    const audios = await queryBuilder
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'audio.total_rented',
        'audio.purchased_rental_license_limit',
        'audio.bookshelf_credit_cost',
        'audio.is_only_for_purchase',
        'metadata.available_for',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
        'metadata.chapters',
        'userAudioStatus.status',
        'userAudioStatus.updated_at',
        'userAudioStatus.rental_expire_at',
        'userAudioStatus.audio_id',
      ])
      .orderBy('audio.total_played', 'DESC')
      .limit(10)
      .getMany();

    return plainToInstance(
      AudioListDto,
      audios.map((audio) => ({
        ...audio,
        rental_credit_cost: appConfigs.audio_rental_credit_cost,
        available_audio_title_user_action:
          appConfigs.available_audio_title_user_action,
      })),
      {
        excludeExtraneousValues: true,
      },
    );
  }

  async findByIds(
    ids: string[],
    relations: string[] = [],
    columns: (keyof Audio)[] = [],
  ) {
    return this.audioRepository.find({
      where: { id: In(ids) },
      relations: relations.length ? relations : undefined,
      select: columns.length
        ? (columns.reduce(
            (acc, column) => ({ ...acc, [column]: true }),
            {},
          ) as FindOptionsSelect<Audio>)
        : undefined,
    });
  }

  async getContinueListeningAudiosOfUser(
    company: any,
    user: User,
    limit: number = 10,
  ): Promise<AudioListDto[]> {
    const [appConfigs, userAudioplayerPositions] = await Promise.all([
      this.appConfigService.getCompanyConfig(company.app_configs),
      this.userAudioplayerPositionRepository
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
        .getMany(),
    ]);

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
      .innerJoin('audio.metadata', 'metadata')
      .leftJoinAndMapOne(
        'audio.userAudioStatus',
        UserAudioStatus,
        'userAudioStatus',
        'userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId',
        { userId: user.id },
      )
      .andWhere('audio.id IN (:...audioIds)', { audioIds });

    // Allow viewing deactivated audios if user has active rental or bookshelf
    this.addIsActiveOrUserOwnsFilter(queryBuilder, user.id);

    queryBuilder.select([
      'audio.id AS id',
      'audio.display_title AS title',
      'audio.display_authors AS authors',
      'metadata.cover_url AS image_url',
      'audio.avg_rating AS avg_rating',
      'audio.total_rented AS total_rented',
      'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
      'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
      'audio.is_only_for_purchase AS is_only_for_purchase',
      'metadata.available_for as available_for',
      'metadata.chapters AS chapters',
      'userAudioStatus.updated_at AS updated_at',
      'userAudioStatus.status AS status',
      'userAudioStatus.rental_expire_at AS rental_expires_at',
      'userAudioStatus.list_order AS list_order',
    ]);

    if (limit) {
      queryBuilder.take(limit);
    }

    const audios = await queryBuilder.getRawMany();

    const sortedAudios = audioIds.map((id) => {
      const media = audios.find((audio) => audio.id === id);
      return {
        ...media,
        rental_credit_cost: appConfigs.audio_rental_credit_cost,
      };
    });

    return plainToInstance(AudioListDto, sortedAudios, {
      excludeExtraneousValues: true,
    });
  }

  async getAudiosOfUserBasedOnStatus(
    company: any,
    user: User,
    status: 'queued' | 'bookshelved' | 'rented',
    limit: number = null,
  ): Promise<AudioListDto[]> {
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
      .leftJoinAndMapOne(
        'audio.userAudioStatus',
        UserAudioStatus,
        'userAudioStatus',
        `userAudioStatus.audio_id = audio.id AND userAudioStatus.user_id = :userId`,
        {
          userId: user.id,
        },
      )
      .andWhere('userAudioStatus.status = :status', { status })
      .andWhere(
        `(userAudioStatus.status != 'rented' OR userAudioStatus.rental_expire_at >= :currentDate)`,
        { currentDate: new Date() },
      );

    // Allow viewing deactivated audios if user has that specific status
    // Pass the status to ensure only that status is shown for inactive audios
    this.addIsActiveOrUserOwnsFilter(queryBuilder, user.id, status);

    // Add config-based filtering
    this.addConfigRestrictionFilter(
      queryBuilder,
      appConfigs.available_audio_title_user_action as
        | 'rent'
        | 'bookshelf'
        | 'both'
        | undefined,
    );

    queryBuilder
      .select([
        'audio.id AS id',
        'audio.display_title AS title',
        'audio.display_authors AS authors',
        'metadata.cover_url AS image_url',
        'audio.avg_rating AS avg_rating',
        'audio.total_rented AS total_rented',
        'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
        'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
        'audio.is_only_for_purchase AS is_only_for_purchase',
        'metadata.available_for as available_for',
        'metadata.chapters AS chapters',
        'userAudioStatus.updated_at AS updated_at',
        'userAudioStatus.status AS status',
        'userAudioStatus.rental_expire_at AS rental_expires_at',
        'userAudioStatus.list_order AS list_order',
      ])
      .orderBy('userAudioStatus.list_order', 'ASC');

    if (limit) {
      queryBuilder.take(limit);
    }

    const audios = await queryBuilder.getRawMany();

    return audios.map((audio) =>
      plainToInstance(
        AudioListDto,
        {
          ...audio,
          rental_credit_cost: appConfigs.audio_rental_credit_cost,
          available_audio_title_user_action:
            appConfigs.available_audio_title_user_action,
        },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async findAllAudioCategoriesForCompany(companyId: string) {
    const cacheKey = CacheKeys.audioCategoriesByCompany(companyId);
    const cachedCategories = await this.cacheService.get(cacheKey);

    if (cachedCategories) {
      return cachedCategories;
    }

    const company = await this.companyService.findById(companyId);
    const catalogs = await this.catalogService.findMany(company.catalogs);
    const audioCatalog =
      catalogs.find((catalog) => catalog.media_type === MEDIA.AUDIO) ?? null;

    const categories = await this.categoryService.findEntitiesByIds(
      audioCatalog.categories,
    );

    // Sort categories alphabetically by name
    const sortedCategories = categories.sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const result = plainToInstance(AudioCategoryDto, sortedCategories, {
      excludeExtraneousValues: true,
    });

    // Cache for 1 hour (3600 seconds)
    await this.cacheService.set(cacheKey, result, 3600);

    return result;
  }

  async getHomeList(user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    const [featuredAudios, popularAudios] = await Promise.all([
      this.getFeaturedAudios(company, user, 10, 1),
      this.getPopularAudios(company, user),
    ]);

    return [
      {
        label: 'Featured Titles',
        slug: 'featured',
        audios: featuredAudios?.data,
      },
      {
        label: 'Continue Listening',
        slug: 'continue_listening',
        audios: await this.getContinueListeningAudiosOfUser(company, user, 10),
      },
      {
        label: 'My Bookshelf',
        slug: 'bookself',
        audios: await this.getAudiosOfUserBasedOnStatus(
          company,
          user,
          'bookshelved',
          10,
        ),
      },
      {
        label: 'Queued Titles',
        slug: 'queued',
        audios: await this.getAudiosOfUserBasedOnStatus(
          company,
          user,
          'queued',
          10,
        ),
      },
      {
        label: 'Popular Audio Titles',
        slug: 'popular',
        audios: popularAudios,
      },
    ];
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
    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    let categoryIds = company.category_ids.audio;
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    let category: any;

    if (categoryId !== 'category_0') {
      if (categoryId && categoryIds.includes(categoryId)) {
        categoryIds = [categoryId];
        category = await this.categoryService.findOne(categoryId);
      }

      if (!categoryIds.length) {
        throw new NotFoundException('Category not found for your company.');
      }
    }

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
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
      .andWhere('audio.is_active = :isActive', { isActive: true });

    // Add config-based filtering
    this.addConfigRestrictionFilter(
      queryBuilder,
      appConfigs.available_audio_title_user_action as
        | 'rent'
        | 'bookshelf'
        | 'both'
        | undefined,
    );

    queryBuilder
      .select([
        'audio.id AS id',
        'audio.display_title AS title',
        'audio.display_authors AS authors',
        'metadata.cover_url AS image_url',
        'audio.avg_rating AS avg_rating',
        'audio.total_rented AS total_rented',
        'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
        'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
        'audio.is_only_for_purchase AS is_only_for_purchase',
        'metadata.available_for as available_for',
        'metadata.chapters AS chapters',
        'userAudioStatus.updated_at AS updated_at',
        'userAudioStatus.status AS status',
        'userAudioStatus.rental_expire_at AS rental_expires_at',
        'userAudioStatus.audio_id AS audio_id',
      ])
      .orderBy('audio.display_title', 'ASC');

    const paginatedData = await paginate(queryBuilder, page, limit);

    paginatedData.data = paginatedData.data.map((audio) =>
      plainToInstance(
        AudioListDto,
        {
          ...audio,
          rental_credit_cost: appConfigs.audio_rental_credit_cost,
          available_audio_title_user_action:
            appConfigs.available_audio_title_user_action,
        },
        { excludeExtraneousValues: true },
      ),
    );

    return {
      category: {
        id: categoryId,
        title: categoryId ? category?.name : 'All categories',
      },
      ...paginatedData,
    };
  }

  async searchAudios(
    user: User,
    query: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedResult<AudioListDto>> {
    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    const categoryIds = company.category_ids.audio;
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
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
      .andWhere(
        new Brackets((qb) => {
          qb.where('audio.display_title ILIKE :query')
            .orWhere('audio.display_description ILIKE :query')
            .orWhere(
              `EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(audio.display_authors) elem
                WHERE elem ILIKE :query
              )`,
            );
        }),
        { query: `%${query}%` },
      );

    // Add config-based filtering
    this.addConfigRestrictionFilter(
      queryBuilder,
      appConfigs.available_audio_title_user_action as
        | 'rent'
        | 'bookshelf'
        | 'both'
        | undefined,
    );

    queryBuilder
      .select([
        'audio.id AS id',
        'audio.display_title AS title',
        'audio.display_authors AS authors',
        'metadata.cover_url AS image_url',
        'audio.avg_rating AS avg_rating',
        'audio.total_rented AS total_rented',
        'audio.purchased_rental_license_limit AS purchased_rental_license_limit',
        'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
        'audio.is_only_for_purchase AS is_only_for_purchase',
        'metadata.available_for as available_for',
        'metadata.chapters AS chapters',
        'userAudioStatus.updated_at AS updated_at',
        'userAudioStatus.status AS status',
        'userAudioStatus.rental_expire_at AS rental_expires_at',
        'userAudioStatus.audio_id AS audio_id',
      ])
      .orderBy('audio.display_title', 'ASC');

    const paginatedData = await paginate(queryBuilder, page, limit);

    paginatedData.data = paginatedData.data.map((audio) =>
      plainToInstance(
        AudioListDto,
        {
          ...audio,
          rental_credit_cost: appConfigs.audio_rental_credit_cost,
          available_audio_title_user_action:
            appConfigs.available_audio_title_user_action,
        },
        { excludeExtraneousValues: true },
      ),
    );

    return paginatedData;
  }

  async findAudioById(id: string, user: User | null): Promise<AudioDto> {
    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const [audio, userAudio] = await Promise.all([
      // Pass userId to allow viewing user's owned deactivated audios
      this.findByIdWithCache(id, user.id),
      // Historical duplicate (user_id, audio_id) rows can exist (the
      // @Unique on the entity was never enforced by a migration). Order by
      // updated_at DESC so the most recent action wins over a stale row.
      this.userAudioStatusRepository.findOne({
        where: { user_id: user.id, audio_id: id },
        select: ['status', 'rental_expire_at'],
        order: { updated_at: 'DESC' },
      }),
    ]);

    // Check if audio is available based on config restriction
    const availableAfterRestriction = applyConfigRestriction(
      audio.metadata?.available_for,
      appConfigs.available_audio_title_user_action as
        | 'rent'
        | 'bookshelf'
        | 'both'
        | undefined,
    );

    if (availableAfterRestriction === null) {
      const titleLabel = this.resolveTitle(audio) ?? 'this audio';
      throw new NotFoundException(
        `Audio "${titleLabel}" is not available for your company.`,
      );
    }

    let status = userAudio?.status ?? null;
    let rentalExpiresAt = userAudio?.rental_expire_at ?? null;

    if (
      status === 'rented' &&
      rentalExpiresAt &&
      rentalExpiresAt <= new Date()
    ) {
      status = null;
      rentalExpiresAt = null;
    }

    return plainToInstance(
      AudioDto,
      {
        ...audio,
        ...{
          status: status,
          rental_expires_at: rentalExpiresAt,
          rental_credit_cost: appConfigs.audio_rental_credit_cost,
          available_audio_title_user_action:
            appConfigs.available_audio_title_user_action,
        },
      },
      { excludeExtraneousValues: true },
    );
  }

  async findAudioPlaylist(audioId: string, user: User) {
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
      .where('audio.id = :id', { id: audioId });

    // Allow access to deactivated audios if user has active rental or bookshelf
    this.addIsActiveOrUserOwnsFilter(queryBuilder, user.id);

    const audio = await queryBuilder.getOne();

    if (!audio) {
      throw new NotFoundException('Audio not found.');
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
    eventType: 'play' | 'pause',
    payload: TriggerAudioPlayerEventDto,
    user: User,
  ) {
    // Pass userId to allow triggering events on user's owned deactivated audios
    const audio = await this.findByIdWithCache(audioId, user.id);

    // Validate chapter existence and payload
    const chapter = audio.metadata.chapters.find(
      (ch: AudioChapter) =>
        ch.part_number === payload.part_number &&
        ch.chapter_number === payload.chapter_number,
    );

    if (!chapter || payload.play_position > chapter.duration) {
      throw new BadRequestException(
        'Invalid chapter or play position exceeds chapter duration',
      );
    }

    // Handle pause event
    if (eventType === 'pause') {
      // Update user audio position
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

      await this.userAudioplayerPositionRepository.save(
        updatedUserAudioplayerPosition,
      );

      // Find latest play activity for pause event
      const latestPlayActivity = await this.userActivityLogRepository.findOne({
        where: {
          user_id: user.id,
          item_type: 'audio',
          item_id: audioId,
          action: USER_ACTIVITY.PLAY,
        },
        order: { created_at: 'DESC' },
      });

      if (latestPlayActivity) {
        const meta = latestPlayActivity.meta || {};

        // Derive the updated end values
        const end_part_number = Math.max(
          meta.end_part_number ?? 0,
          payload.part_number,
        );
        const end_chapter_number = Math.max(
          meta.end_chapter_number ?? 0,
          payload.chapter_number,
        );
        const end_position = Math.max(
          meta.end_position ?? 0,
          payload.play_position,
        );

        // Now calculate total time played after computing end values
        const totalTimePlayed = this.calculateTotalTimePlayed(
          audio.metadata.chapters,
          {
            part_number: meta.start_part_number,
            chapter_number: meta.start_chapter_number,
            position: meta.start_position,
          },
          {
            part_number: end_part_number,
            chapter_number: end_chapter_number,
            position: end_position,
          },
        );

        latestPlayActivity.meta = {
          start_part_number: meta.start_part_number,
          start_chapter_number: meta.start_chapter_number,
          start_position: meta.start_position,
          end_part_number,
          end_chapter_number,
          end_position,
          total_time_played: totalTimePlayed,
        };

        latestPlayActivity.updated_at = new Date();

        await this.userActivityLogRepository.save(latestPlayActivity);
      }
    }

    // Handle play event
    if (eventType === 'play') {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const existingPlayActivity = await this.userActivityLogRepository.findOne(
        {
          where: {
            user_id: user.id,
            item_type: 'audio',
            item_id: audioId,
            action: USER_ACTIVITY.PLAY,
            created_at: Raw((alias) => `DATE(${alias}) = :date`, {
              date: today,
            }),
          },
        },
      );

      if (existingPlayActivity) {
        const meta = existingPlayActivity.meta || {};

        // Derive the updated end values
        const start_part_number = Math.min(
          meta.start_part_number,
          payload.part_number,
        );
        const start_chapter_number = Math.min(
          meta.start_chapter_number,
          payload.chapter_number,
        );
        const start_position = Math.min(
          meta.start_position,
          payload.play_position,
        );

        // Now calculate total time played after computing end values
        const totalTimePlayed = this.calculateTotalTimePlayed(
          audio.metadata.chapters,
          {
            part_number: start_part_number,
            chapter_number: start_chapter_number,
            position: start_position,
          },
          {
            part_number: meta.end_part_number,
            chapter_number: meta.end_chapter_number,
            position: meta.end_position,
          },
        );

        existingPlayActivity.meta = {
          start_part_number: start_part_number,
          start_chapter_number: start_chapter_number,
          start_position: start_position,
          end_part_number: meta.end_part_number,
          end_chapter_number: meta.end_chapter_number,
          end_position: meta.end_position,
          total_time_played: totalTimePlayed,
        };

        existingPlayActivity.updated_at = new Date();

        await Promise.all([
          this.incrementTotalPlayedOfAudio(audioId),
          this.userActivityLogRepository.save(existingPlayActivity),
        ]);
      } else {
        const meta = {
          start_part_number: payload.part_number,
          start_chapter_number: payload.chapter_number,
          start_position: payload.play_position,
          total_time_played: 0,
        };

        await Promise.all([
          this.incrementTotalPlayedOfAudio(audioId),
          this.userActivityLogService.create({
            user_id: user.id,
            item_type: 'audio',
            item_id: audioId,
            action: USER_ACTIVITY.PLAY,
            meta,
          }),
        ]);
      }
    }
  }

  async assignCategory(category: Category, ids: string[]) {
    if (!ids.length) return;

    await this.audioRepository
      .createQueryBuilder()
      .update(Audio)
      .set({
        categories: () => `
          (
            SELECT jsonb_agg(DISTINCT elem)
            FROM (
              SELECT jsonb_array_elements(categories) AS elem
              UNION ALL
              SELECT '"${category.id}"'::jsonb
            ) AS combined
          )
        `,
      })
      .where('id IN (:...ids)', { ids })
      .execute();
  }

  async deassignCategory(category: Category, ids: string[]) {
    if (!ids.length) return;

    // Use raw SQL with proper JSONB comparison
    // Ignore audios where categories is NULL or empty array []
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');

    // Build the category value as a JSONB string to match how assign adds it
    const categoryJsonbValue = `'"${category.id}"'::jsonb`;

    const sql = `
      UPDATE audios
      SET categories = (
        SELECT jsonb_agg(elem)
        FROM jsonb_array_elements(categories) AS elem
        WHERE elem <> ${categoryJsonbValue}
      )
      WHERE id IN (${placeholders})
        AND categories IS NOT NULL
        AND categories <> '[]'::jsonb
        AND categories @> $1::jsonb
    `;

    const params = [JSON.stringify([category.id]), ...ids];

    this.logger.debug(`Deassign SQL: ${sql}`);
    this.logger.debug(`Deassign Params: ${JSON.stringify(params)}`);

    const result = await this.audioRepository.query(sql, params);
    this.logger.log(`Deassign result: ${JSON.stringify(result)}`);
  }

  async incrementTotalPlayedOfAudio(id: string) {
    if (!id) return;

    await this.audioRepository
      .createQueryBuilder()
      .update(Audio)
      .set({ total_played: () => 'total_played + 1' }) // Increment total_played
      .where('id = :id', { id })
      .execute();
  }

  async getAudioIdsByCategory(categoryId: string) {
    const audios = await this.audioRepository
      .createQueryBuilder('audio')
      .select('audio.id AS id')
      .andWhere('audio.categories @> :categoryId', {
        categoryId: JSON.stringify([categoryId]),
      })
      .getRawMany();

    return audios.map((audio) => audio.id);
  }

  // Helper method to calculate total time played
  private calculateTotalTimePlayed(
    chapters: AudioChapter[],
    start: { part_number: number; chapter_number: number; position: number },
    end: { part_number: number; chapter_number: number; position: number },
  ): number {
    let totalTime = 0;

    // Sort chapters to process them in order
    const sortedChapters = [...chapters].sort((a, b) => {
      if (a.part_number !== b.part_number) {
        return a.part_number - b.part_number;
      }
      return a.chapter_number - b.chapter_number;
    });

    for (const chapter of sortedChapters) {
      // Check if chapter is within the played range
      if (
        (chapter.part_number > start.part_number ||
          (chapter.part_number === start.part_number &&
            chapter.chapter_number >= start.chapter_number)) &&
        (chapter.part_number < end.part_number ||
          (chapter.part_number === end.part_number &&
            chapter.chapter_number <= end.chapter_number))
      ) {
        // For start chapter
        if (
          chapter.part_number === start.part_number &&
          chapter.chapter_number === start.chapter_number
        ) {
          totalTime += chapter.duration - start.position;
          continue;
        }

        // For end chapter
        if (
          chapter.part_number === end.part_number &&
          chapter.chapter_number === end.chapter_number
        ) {
          totalTime += end.position;
          break;
        }

        // For chapters in between
        totalTime += chapter.duration;
      }
    }

    return totalTime;
  }
}
