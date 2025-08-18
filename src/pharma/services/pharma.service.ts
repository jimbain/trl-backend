import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  NotAcceptableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Raw, Repository } from 'typeorm';
import { Pharma } from '../entities/pharma.entity';
import { StorageService } from 'src/storage/storage.service';
import { PharmaListDto } from '../dto/pharma.dto';
import { PaginationMeta } from 'src/common/interfaces';
import { paginate } from 'src/common/helpers/pagination.helper';
import { plainToInstance } from 'class-transformer';
import { CompanyService } from 'src/companies/company.service';
import { CategoryService } from 'src/categories/category.service';
import { PharmaCategoryDto } from '../dto/pharma-category.dto';
import { User } from 'src/users/entities/user.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { PharmaUserStatus } from '../entities/pharma-user-status.entity';
import { QueryPharmaDto } from '../dto/query-pharma.dto';
import { Category } from 'src/categories/entities/category.entity';
import { TriggerPharmaVideoPlayerEventDto } from '../dto/trigger-pharma-video-player-event.dto';
import { CacheService } from 'src/common/services/cache.service';
import { PharmaUserVideoplayerPosition } from '../entities/pharma-user-videoplayer-position.entity';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { MEDIA, USER_ACTIVITY } from 'src/constants';
import { UserActivityLogService } from 'src/users/user-activity-log.service';

@Injectable()
export class PharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    @InjectRepository(PharmaUserStatus)
    private readonly pharmaUserStatusRepository: Repository<PharmaUserStatus>,

    @InjectRepository(PharmaUserVideoplayerPosition)
    private readonly pharmaUserVideoplayerPositionRepository: Repository<PharmaUserVideoplayerPosition>,

    @InjectRepository(UserActivityLog)
    private readonly userActivityLogRepository: Repository<UserActivityLog>,

    private readonly appConfigService: AppConfigService,
    private readonly cacheService: CacheService,
    private readonly companyService: CompanyService,
    @Inject(forwardRef(() => CategoryService))
    private readonly categoryService: CategoryService,
    private readonly storageService: StorageService,
    private readonly userActivityLogService: UserActivityLogService,
  ) {}

  async findAllCategoryIdOfCompany(companyId: string): Promise<string[]> {
    const company = await this.companyService.findByIdWithCache(companyId);
    return company.category_ids.pharma || [];
  }

  private calculateRentalValidity(item: {
    status?: 'rented' | 'queued';
    current_rental_expire_at?: string | Date | null;
    next_rental_expire_at?: string | Date | null;
  }): boolean {
    if (!item.status || item.status !== 'rented') {
      return false;
    }
    const now = new Date();
    const currentRental = item.current_rental_expire_at
      ? new Date(item.current_rental_expire_at)
      : null;
    const nextRental = item.next_rental_expire_at
      ? new Date(item.next_rental_expire_at)
      : null;

    return (
      (currentRental && currentRental > now) || (nextRental && nextRental > now)
    );
  }

  private canRenewRent(item: {
    status?: 'rented' | 'queued';
    current_rental_expire_at?: string | Date | null;
    next_rental_expire_at?: string | Date | null;
  }): boolean {
    if (!item.status || item.status !== 'rented') {
      return false;
    }

    const now = new Date();
    const currentRental = item.current_rental_expire_at
      ? new Date(item.current_rental_expire_at)
      : null;
    const nextRental = item.next_rental_expire_at
      ? new Date(item.next_rental_expire_at)
      : null;

    // Case 1: current rental is valid and no next rental yet
    if (currentRental && currentRental > now && !nextRental) {
      return true;
    }

    // Case 2: current rental expired but next rental exists and is in the future
    if (
      (!currentRental || currentRental <= now) &&
      nextRental &&
      nextRental > now
    ) {
      return true;
    }

    return false;
  }

  private canReturnRenewalRent(item: {
    status?: 'rented' | 'queued';
    current_rental_expire_at?: string | Date | null;
    next_rental_expire_at?: string | Date | null;
  }): boolean {
    if (!item.status || item.status !== 'rented') {
      return false;
    }

    const now = new Date();
    const currentRental = item.current_rental_expire_at
      ? new Date(item.current_rental_expire_at)
      : null;
    const nextRental = item.next_rental_expire_at
      ? new Date(item.next_rental_expire_at)
      : null;

    // AND next rental exists in the future
    return !!(
      currentRental &&
      currentRental > now &&
      nextRental &&
      nextRental > currentRental
    );
  }

  async findAll(
    query: QueryPharmaDto,
    user: User,
  ): Promise<{
    data: PharmaListDto[];
    meta: PaginationMeta;
  }> {
    const {
      page,
      per_page,
      category_id,
      is_included_in_category,
      category_ids,
      is_featured,
      search,
      status,
      sort_by,
      sort_order,
      popular,
    } = query;

    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    const allowedPharmaCategoryIds = company.category_ids.pharma || [];

    // Determine effective category ids: intersection of provided ids with allowed ids, or all allowed ids if none provided
    const effectiveCategoryIds =
      Array.isArray(category_ids) && category_ids.length
        ? category_ids.filter((id) => allowedPharmaCategoryIds.includes(id))
        : allowedPharmaCategoryIds;

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const queryBuilder = this.pharmaRepository
      .createQueryBuilder('pharma')
      .leftJoinAndMapOne(
        'pharma.userStatuses',
        PharmaUserStatus,
        'pharmaUserStatus',
        'pharmaUserStatus.pharma_id = pharma.id AND pharmaUserStatus.user_id = :userId',
        { userId: user.id },
      )
      .andWhere('pharma.is_active = :isActive', { isActive: true })
      .select([
        'pharma.id AS id',
        'pharma.sku AS sku',
        'pharma.title AS title',
        'pharma.image_url AS image_url',
        'pharma.avg_rating AS avg_rating',
        'pharma.is_featured AS is_featured',
        'pharmaUserStatus.status AS status',
        'pharmaUserStatus.current_rental_expire_at AS current_rental_expire_at',
        'pharmaUserStatus.next_rental_expire_at AS next_rental_expire_at',
      ]);

    if (is_featured !== undefined) {
      queryBuilder.andWhere('pharma.is_featured = :isFeatured', {
        isFeatured: is_featured,
      });
    }

    // Add popular filter
    if (popular) {
      queryBuilder.andWhere('pharma.total_played > 0');
    }

    // Always restrict by the company's allowed pharma categories (effectiveCategoryIds)
    if (effectiveCategoryIds && effectiveCategoryIds.length > 0) {
      queryBuilder.andWhere(
        `array(SELECT jsonb_array_elements_text(pharma.categories)) && :categoryIds`,
        { categoryIds: effectiveCategoryIds },
      );
    } else {
      // If no allowed categories, force empty result
      queryBuilder.andWhere('1=0');
    }

    if (category_id) {
      if (is_included_in_category === true) {
        // Filter pharmas that ARE included in the specified category
        queryBuilder.andWhere('pharma.categories @> :singleCategoryId', {
          singleCategoryId: JSON.stringify([category_id]),
        });
      } else if (is_included_in_category === false) {
        // Filter pharmas that are NOT included in the specified category
        queryBuilder.andWhere('NOT (pharma.categories @> :singleCategoryId)', {
          singleCategoryId: JSON.stringify([category_id]),
        });
      }
    }

    // Add search functionality
    if (search) {
      queryBuilder.andWhere('pharma.title ILIKE :search', {
        search: `%${search}%`,
      });
    }

    // Add status filter on pharmaUserStatus.status
    if (status !== undefined) {
      queryBuilder.andWhere('pharmaUserStatus.status = :status', {
        status: status,
      });
    }

    // Add sorting
    if (sort_by) {
      const validSortFields = ['title', 'created_at', 'updated_at'];
      const sortField = validSortFields.includes(sort_by)
        ? sort_by
        : 'created_at';
      const sortDirection = sort_order === 'desc' ? 'DESC' : 'ASC';
      queryBuilder.orderBy(`pharma.${sortField}`, sortDirection);
    } else if (popular) {
      // Popular sorting by rating
      queryBuilder.orderBy('pharma.total_played', 'DESC');
    } else {
      // Default sorting
      queryBuilder.orderBy('pharma.created_at', 'DESC');
    }

    const paginatedData = await paginate(queryBuilder, page, per_page);

    paginatedData.data = await Promise.all(
      paginatedData.data.map(async (item) => ({
        ...item,
        image_url: item.image_url
          ? await this.storageService.generateSignedViewUrl(item.image_url)
          : null,
        rental_credit_cost: appConfigs.pharma_rental_credit_cost,
        is_rental_valid: this.calculateRentalValidity(item),
        can_renew: this.canRenewRent(item),
        can_return: this.canReturnRenewalRent(item),
      })),
    );

    return paginatedData;
  }

  async findById(id: string): Promise<Pharma> {
    const pharma = await this.pharmaRepository.findOne({ where: { id } });
    if (!pharma) {
      throw new NotFoundException(`Pharma with id "${id}" not found`);
    }
    return pharma;
  }

  async findByIdWithCache(id: string) {
    const cachedAudio = await this.cacheService.get(id);
    if (cachedAudio) return cachedAudio;

    const audio = await this.findById(id);

    await this.cacheService.set(id, audio);
    return audio;
  }

  async findPharmaUserVideoPlayerPosition(
    pharmaId: string,
    userId: string,
  ): Promise<PharmaUserVideoplayerPosition | null> {
    const now = new Date();

    const userPharmaStatus = await this.pharmaUserStatusRepository.findOne({
      where: {
        pharma_id: pharmaId,
        user_id: userId,
        status: 'rented',
        current_rental_expire_at: MoreThan(now),
      },
    });

    if (!userPharmaStatus) {
      return null;
    }

    const position = await this.pharmaUserVideoplayerPositionRepository.findOne(
      {
        where: { pharma_id: pharmaId, user_id: userId },
      },
    );

    if (!position) {
      return null;
    }

    return position;
  }

  async findOne(id: string, user: User): Promise<any> {
    const pharma = await this.pharmaRepository
      .createQueryBuilder('pharma')
      .leftJoinAndMapOne(
        'pharma.userStatus',
        PharmaUserStatus,
        'pharmaUserStatus',
        'pharmaUserStatus.pharma_id = pharma.id AND pharmaUserStatus.user_id = :userId',
        { userId: user.id },
      )
      .where('pharma.id = :id', { id })
      .select([
        'pharma.id AS id',
        'pharma.title AS title',
        'pharma.description AS description',
        'pharma.image_url AS image_url',
        'pharma.video_url AS video_url',
        'pharma.categories AS categories',
        'pharma.runtime AS runtime',
        'pharma.avg_rating AS avg_rating',
        'pharma.is_featured AS is_featured',
        'pharmaUserStatus.status AS status',
        'pharmaUserStatus.current_rental_expire_at AS current_rental_expire_at',
        'pharmaUserStatus.next_rental_expire_at AS next_rental_expire_at',
        'pharmaUserStatus.rental_start_at AS rental_start_at',
      ])
      .getRawOne();

    if (!pharma) {
      throw new NotFoundException(`Pharma with id "${id}" not found`);
    }

    // Transform image URLs
    if (pharma.image_url) {
      pharma.image_url = await this.storageService.generateSignedViewUrl(
        pharma.image_url,
      );
    }
    if (pharma.video_url) {
      pharma.video_url = await this.storageService.generateSignedViewUrl(
        pharma.video_url,
      );
    }

    const playPosition = await this.findPharmaUserVideoPlayerPosition(
      pharma.id,
      user.id,
    );

    pharma.play_position = playPosition?.play_position ?? null;
    pharma.is_rental_valid = this.calculateRentalValidity(pharma);
    pharma.can_renew = this.canRenewRent(pharma);
    pharma.can_return = this.canReturnRenewalRent(pharma);

    return pharma;
  }

  async getTransformed(pharma: Pharma): Promise<Pharma> {
    if (pharma.image_url) {
      pharma.image_url = await this.storageService.generateSignedViewUrl(
        pharma.image_url,
      );
    }

    if (pharma.video_url) {
      pharma.video_url = await this.storageService.generateSignedViewUrl(
        pharma.video_url,
      );
    }

    return pharma;
  }

  async getPharmaIdsByCategory(categoryId: string) {
    const pharmas = await this.pharmaRepository
      .createQueryBuilder('pharma')
      .select('pharma.id AS id')
      .andWhere('pharma.categories @> :categoryId', {
        categoryId: JSON.stringify([categoryId]),
      })
      .getRawMany();

    return pharmas.map((pharma) => pharma.id);
  }

  async findAllCategoryForCompany(companyId: string) {
    const categoryIds = await this.findAllCategoryIdOfCompany(companyId);

    if (!categoryIds.length) {
      return [];
    }

    const categories =
      await this.categoryService.findEntitiesByIds(categoryIds);

    return plainToInstance(PharmaCategoryDto, categories, {
      excludeExtraneousValues: true,
    });
  }

  async findCategoryForCompany(id: string, companyId: string) {
    const categoryIds = await this.findAllCategoryIdOfCompany(companyId);

    if (!categoryIds.includes(id)) {
      throw new NotAcceptableException(
        `Category with id "${id}" is not allowed for company "${companyId}"`,
      );
    }

    return this.categoryService.findOne(id);
  }

  async getHomeList(user: User) {
    const [
      featuredPharmas,
      queuedPharmas,
      continueWatchingPharmas,
      popularPharmas,
    ] = await Promise.all([
      this.findAll({ is_featured: true, per_page: 10 }, user),
      this.findAll({ status: 'queued', per_page: 10 }, user),
      this.findAll({ status: 'rented', per_page: 10 }, user),
      this.findAll({ popular: true, per_page: 10 }, user),
    ]);

    return [
      {
        label: 'Featured Titles',
        slug: 'featured',
        pharmas: featuredPharmas?.data,
      },
      {
        label: 'Queued Titles',
        slug: 'queued',
        pharmas: queuedPharmas?.data,
      },
      {
        label: 'Continue Watching',
        slug: 'continue_watching',
        pharmas: continueWatchingPharmas?.data,
      },
      {
        label: 'Popular Pharma Titles',
        slug: 'popular',
        pharmas: popularPharmas?.data,
      },
    ];
  }

  async incrementTotalPlayedOfPharma(id: string) {
    if (!id) return;

    await this.pharmaRepository
      .createQueryBuilder()
      .update(Pharma)
      .set({ total_played: () => 'total_played + 1' })
      .where('id = :id', { id })
      .execute();
  }

  async triggerVideoPlayerEvent(
    id: string,
    eventType: 'play' | 'pause',
    payload: TriggerPharmaVideoPlayerEventDto,
    user: User,
  ) {
    const pharma = await this.findByIdWithCache(id);
    const now = new Date();

    const userPharmaStatus = await this.pharmaUserStatusRepository
      .createQueryBuilder('status')
      .where('status.pharma_id = :pharmaId', { pharmaId: id })
      .andWhere('status.user_id = :userId', { userId: user.id })
      .andWhere('status.status = :status', { status: 'rented' })
      .andWhere(
        '(status.current_rental_expire_at > :now OR status.next_rental_expire_at > :now)',
        { now },
      )
      .getOne();

    if (!userPharmaStatus) {
      throw new NotAcceptableException(
        `Need to rent the pharma for triggering video player events.`,
      );
    }

    // ─────────────── Handle pause event ───────────────
    if (eventType === 'pause') {
      // Save or update user's video position
      const existingPharmaUserVideoPosition =
        await this.pharmaUserVideoplayerPositionRepository.findOne({
          where: { pharma_id: pharma.id, user_id: user.id },
        });

      const updatedPharmaUserVideoplayerPosition =
        existingPharmaUserVideoPosition
          ? {
              ...existingPharmaUserVideoPosition,
              play_position: payload.play_position,
              updated_at: new Date(),
            }
          : this.pharmaUserVideoplayerPositionRepository.create({
              user_id: user.id,
              pharma_id: id,
              play_position: payload.play_position,
              updated_at: new Date(),
            });

      await this.pharmaUserVideoplayerPositionRepository.save(
        updatedPharmaUserVideoplayerPosition,
      );

      // Update user activity log (pause → update last PLAY record)
      const latestPlayActivity = await this.userActivityLogRepository.findOne({
        where: {
          user_id: user.id,
          item_type: MEDIA.PHARMA,
          item_id: id,
          action: USER_ACTIVITY.PLAY,
        },
        order: { created_at: 'DESC' },
      });

      if (latestPlayActivity) {
        const meta = latestPlayActivity.meta || {};

        const end_position = Math.max(
          meta.end_position ?? 0,
          payload.play_position,
        );

        const totalTimePlayed =
          (end_position ?? 0) - (meta.start_position ?? 0);

        latestPlayActivity.meta = {
          start_position: meta.start_position,
          end_position,
          total_time_played: totalTimePlayed > 0 ? totalTimePlayed : 0,
        };

        latestPlayActivity.updated_at = new Date();

        await this.userActivityLogRepository.save(latestPlayActivity);
      }
    }

    // ─────────────── Handle play event ───────────────
    if (eventType === 'play') {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const existingPlayActivity = await this.userActivityLogRepository.findOne(
        {
          where: {
            user_id: user.id,
            item_type: MEDIA.PHARMA,
            item_id: id,
            action: USER_ACTIVITY.PLAY,
            created_at: Raw((alias) => `DATE(${alias}) = :date`, {
              date: today,
            }),
          },
        },
      );

      if (existingPlayActivity) {
        const meta = existingPlayActivity.meta || {};

        const start_position = Math.min(
          meta.start_position ?? payload.play_position,
          payload.play_position,
        );

        const totalTimePlayed =
          (meta.end_position ?? 0) - (start_position ?? 0);

        existingPlayActivity.meta = {
          start_position,
          end_position: meta.end_position,
          total_time_played: totalTimePlayed > 0 ? totalTimePlayed : 0,
        };

        existingPlayActivity.updated_at = new Date();

        await Promise.all([
          this.incrementTotalPlayedOfPharma(id),
          this.userActivityLogRepository.save(existingPlayActivity),
        ]);
      } else {
        // Create a fresh play activity log
        const meta = {
          start_position: payload.play_position,
          total_time_played: 0,
        };

        await Promise.all([
          this.incrementTotalPlayedOfPharma(id),
          this.userActivityLogService.create({
            user_id: user.id,
            item_type: MEDIA.PHARMA,
            item_id: id,
            action: USER_ACTIVITY.PLAY,
            meta,
          }),
        ]);
      }
    }
  }

  async assignCategory(category: Category, ids: string[]) {
    if (!ids.length) return;

    await this.pharmaRepository
      .createQueryBuilder()
      .update(Pharma)
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

    await this.pharmaRepository
      .createQueryBuilder()
      .update(Pharma)
      .set({
        categories: () => `
            (
              SELECT jsonb_agg(elem)
              FROM jsonb_array_elements(categories) AS elem
              WHERE elem != '"${category.id}"'
            )
          `,
      })
      .where('id IN (:...ids)', { ids })
      .execute();
  }
}
