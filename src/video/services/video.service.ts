import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  NotAcceptableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Raw, Repository } from 'typeorm';
import { Video } from '../entities/video.entity';
import { StorageService } from 'src/storage/storage.service';
import { VideoListDto } from '../dto/video.dto';
import { PaginationMeta } from 'src/common/interfaces';
import { paginate } from 'src/common/helpers/pagination.helper';
import { plainToInstance } from 'class-transformer';
import { CompanyService } from 'src/companies/company.service';
import { CategoryService } from 'src/categories/category.service';
import { CachedCompany } from 'src/companies/company.interface';
import { User } from 'src/users/entities/user.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { VideoUserStatus } from '../entities/video-user-status.entity';
import { QueryVideoDto } from '../dto/query-video.dto';
import { CacheService } from 'src/common/services/cache.service';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { MEDIA, USER_ACTIVITY } from 'src/constants';
import { UserActivityLogService } from 'src/users/user-activity-log.service';
import { CreateVideoDto } from '../dto/create-video.dto';
import { UpdateVideoDto } from '../dto/update-video.dto';
import { TriggerVideoPlayerEventDto } from '../dto/trigger-video-player-event.dto';
import { VideoCategoryDto } from '../dto/video-category.dto';

@Injectable()
export class VideoService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,

    @InjectRepository(VideoUserStatus)
    private readonly videoUserStatusRepository: Repository<VideoUserStatus>,

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

  private calculateRentalValidity(item: {
    status?: 'rented' | 'queued';
    current_rental_expire_at?: string | Date | null;
  }): boolean {
    if (item.status !== 'rented' || !item.current_rental_expire_at) {
      return false;
    }

    const now = new Date();
    const expireAt = new Date(item.current_rental_expire_at);
    return expireAt > now;
  }

  private canRenewRent(item: {
    status?: 'rented' | 'queued';
    current_rental_expire_at?: string | Date | null;
    next_rental_expire_at?: string | Date | null;
  }): boolean {
    return (
      item.status === 'rented' &&
      !!item.current_rental_expire_at &&
      !item.next_rental_expire_at &&
      this.calculateRentalValidity(item)
    );
  }

  private canReturnRenewalRent(item: {
    status?: 'rented' | 'queued';
    current_rental_expire_at?: string | Date | null;
    next_rental_expire_at?: string | Date | null;
  }): boolean {
    if (!item.current_rental_expire_at || !item.next_rental_expire_at) {
      return false;
    }

    const currentRental = new Date(item.current_rental_expire_at);
    const nextRental = new Date(item.next_rental_expire_at);
    const now = new Date();

    return (
      item.status === 'rented' &&
      currentRental > now &&
      nextRental > currentRental
    );
  }

  async findAll(
    query: QueryVideoDto,
    user: User,
  ): Promise<{
    data: VideoListDto[];
    meta: PaginationMeta;
  }> {
    const {
      page = 1,
      per_page = 10,
      category_id,
      is_included_in_category,
      category_ids,
      is_featured,
      search,
      status,
      sort_by = 'created_at',
      sort_order = 'desc',
      popular,
      avilar_course_id,
      group,
    } = query;

    const company: CachedCompany = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    const allowedVideoCategoryIds = company.category_ids.video || [];

    // Determine effective category ids: intersection of provided ids with allowed ids, or all allowed ids if none provided
    const effectiveCategoryIds =
      Array.isArray(category_ids) && category_ids.length
        ? category_ids.filter((id) => allowedVideoCategoryIds.includes(id))
        : allowedVideoCategoryIds;

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const queryBuilder = this.videoRepository
      .createQueryBuilder('video')
      .leftJoinAndMapOne(
        'video.userStatuses',
        VideoUserStatus,
        'videoUserStatus',
        'videoUserStatus.video_id = video.id AND videoUserStatus.user_id = :userId',
        { userId: user.id },
      )
      .andWhere('video.is_active = :isActive', { isActive: true })
      .select([
        'video.id AS id',
        'video.sku AS sku',
        'video.title AS title',
        'video.image_url AS image_url',
        'video.avg_rating AS avg_rating',
        'video.is_featured AS is_featured',
        'videoUserStatus.status AS status',
        'videoUserStatus.current_rental_expire_at AS current_rental_expire_at',
        'videoUserStatus.next_rental_expire_at AS next_rental_expire_at',
      ]);

    if (is_featured !== undefined) {
      queryBuilder.andWhere('video.is_featured = :isFeatured', {
        isFeatured: is_featured,
      });
    }

    // Add popular filter
    if (popular) {
      queryBuilder.andWhere('video.total_played > 0');
    }

    if (search) {
      queryBuilder.andWhere(
        '(video.title ILIKE :search OR video.description ILIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (avilar_course_id) {
      queryBuilder.andWhere('video.avilar_course_id = :avilar_course_id', {
        avilar_course_id,
      });
    }

    if (group) {
      queryBuilder.andWhere('video.group = :group', {
        group,
      });
    }

    // Category filtering - use effective category IDs
    if (effectiveCategoryIds.length > 0) {
      const categoryConditions = effectiveCategoryIds.map(
        (_, index) => `video.categories @> :category_${index}`,
      );
      const categoryParams = effectiveCategoryIds.reduce(
        (params, categoryId, index) => {
          params[`category_${index}`] = JSON.stringify([categoryId]);
          return params;
        },
        {},
      );

      queryBuilder.andWhere(
        `(${categoryConditions.join(' OR ')})`,
        categoryParams,
      );
    }

    // User status filtering
    if (status) {
      queryBuilder.andWhere('videoUserStatus.status = :status', { status });
    }

    // Sorting
    if (sort_by && sort_order) {
      const sortField = `video.${sort_by}`;
      queryBuilder.orderBy(
        sortField,
        sort_order.toUpperCase() as 'ASC' | 'DESC',
      );
    } else if (popular) {
      queryBuilder.orderBy('video.total_played', 'DESC');
    } else {
      queryBuilder.orderBy('video.created_at', 'DESC');
    }

    const { data, meta } = await paginate(queryBuilder, page, per_page);

    // Transform image URLs for each video
    const transformedData = await Promise.all(
      data.map(async (video: any) => {
        if (video.image_url) {
          video.image_url = await this.storageService.generateSignedViewUrl(
            video.image_url,
          );
        }

        // Add rental validity and action flags
        video.is_rental_valid = this.calculateRentalValidity(video);
        video.can_renew = this.canRenewRent(video);
        video.can_return = this.canReturnRenewalRent(video);

        return video;
      }),
    );

    return {
      data: plainToInstance(VideoListDto, transformedData, {
        excludeExtraneousValues: true,
      }),
      meta,
    };
  }

  async findOne(id: string, user: User): Promise<any> {
    const video = await this.videoRepository
      .createQueryBuilder('video')
      .leftJoinAndMapOne(
        'video.userStatus',
        VideoUserStatus,
        'videoUserStatus',
        'videoUserStatus.video_id = video.id AND videoUserStatus.user_id = :userId',
        { userId: user.id },
      )
      .where('video.id = :id', { id })
      .select([
        'video.id AS id',
        'video.title AS title',
        'video.description AS description',
        'video.image_url AS image_url',
        'video.categories AS categories',
        'video.runtime AS runtime',
        'video.avg_rating AS avg_rating',
        'video.is_featured AS is_featured',
        'videoUserStatus.status AS status',
        'videoUserStatus.current_rental_expire_at AS current_rental_expire_at',
        'videoUserStatus.next_rental_expire_at AS next_rental_expire_at',
        'videoUserStatus.rental_start_at AS rental_start_at',
      ])
      .getRawOne();

    if (!video) {
      throw new NotFoundException(`Video with id "${id}" not found`);
    }

    // Transform image URLs
    if (video.image_url) {
      video.image_url = await this.storageService.generateSignedViewUrl(
        video.image_url,
      );
    }

    // TODO: Add video player position logic when implemented
    // const playPosition = await this.findVideoUserPlayerPosition(video.id, user.id);
    // video.play_position = playPosition?.play_position ?? null;

    video.is_rental_valid = this.calculateRentalValidity(video);
    video.can_renew = this.canRenewRent(video);
    video.can_return = this.canReturnRenewalRent(video);

    return video;
  }

  async findById(id: string): Promise<Video> {
    const video = await this.videoRepository.findOne({
      where: { id, is_active: true },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    return video;
  }

  async create(createVideoDto: CreateVideoDto): Promise<Video> {
    const video = this.videoRepository.create(createVideoDto);
    return await this.videoRepository.save(video);
  }

  async update(id: string, updateVideoDto: UpdateVideoDto): Promise<Video> {
    const video = await this.findById(id);
    Object.assign(video, updateVideoDto);
    return await this.videoRepository.save(video);
  }

  async remove(id: string): Promise<void> {
    const video = await this.findById(id);
    await this.videoRepository.softDelete(id);
  }

  async incrementTotalPlayed(videoId: string): Promise<void> {
    await this.videoRepository.update(
      { id: videoId },
      { total_played: () => 'total_played + 1' },
    );
  }

  async updateAverageRating(videoId: string): Promise<void> {
    const result = await this.videoRepository
      .createQueryBuilder('video')
      .leftJoin('video.reviews', 'review')
      .select('AVG(review.rate)', 'avg_rating')
      .where('video.id = :videoId', { videoId })
      .getRawOne();

    const avgRating = parseFloat(result.avg_rating) || 0;

    await this.videoRepository.update(
      { id: videoId },
      { avg_rating: avgRating },
    );
  }

  async findAllCategoryIdOfCompany(companyId: string): Promise<string[]> {
    const company: CachedCompany =
      await this.companyService.findByIdWithCache(companyId);
    return company.category_ids?.video || [];
  }

  async findAllCategoryForCompany(companyId: string) {
    const categoryIds = await this.findAllCategoryIdOfCompany(companyId);

    if (!categoryIds.length) {
      return [];
    }

    const categories =
      await this.categoryService.findEntitiesByIds(categoryIds);

    return plainToInstance(VideoCategoryDto, categories, {
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

  async getHomeList(user: User): Promise<any> {
    // Get featured videos
    const featuredVideos = await this.findAll(
      { is_featured: true, per_page: 10 },
      user,
    );

    // Get popular videos
    const popularVideos = await this.findAll(
      { popular: true, per_page: 10 },
      user,
    );

    // Get user's queued videos
    const queuedVideos = await this.findAll(
      { status: 'queued', per_page: 10 },
      user,
    );

    // Get user's rented videos
    const rentedVideos = await this.findAll(
      { status: 'rented', per_page: 10 },
      user,
    );

    return [
      {
        label: 'Featured Titles',
        slug: 'featured',
        pharmas: featuredVideos?.data,
      },
      {
        label: 'Queued Titles',
        slug: 'queued',
        pharmas: queuedVideos?.data,
      },
      {
        label: 'Continue Watching',
        slug: 'continue_watching',
        pharmas: rentedVideos?.data,
      },
      {
        label: 'Popular Pharma Titles',
        slug: 'popular',
        pharmas: popularVideos?.data,
      },
    ];
  }

  async triggerVideoPlayerEvent(
    videoId: string,
    payload: TriggerVideoPlayerEventDto,
    user: User,
  ): Promise<{ message: string }> {
    const video = await this.findById(videoId);

    // Log user activity
    await this.userActivityLogService.create({
      user_id: user.id,
      item_type: MEDIA.VIDEO,
      item_id: video.id,
      action: USER_ACTIVITY.VIDEO_PLAYER_EVENT,
      meta: {
        event: payload.event,
        play_position: payload.play_position,
      },
    });

    // Increment total played if it's a play event
    if (payload.event === 'play' || payload.event === 'ended') {
      await this.incrementTotalPlayed(videoId);
    }

    return { message: 'Video player event recorded successfully' };
  }
}
