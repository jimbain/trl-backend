import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotAcceptableException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { In, Repository } from 'typeorm';
import { CategoryDto } from './dto/category.dto';
import { plainToInstance } from 'class-transformer';
import { CATALOG_CATEGORY_TYPE, MEDIA, Media } from 'src/constants';
import { CatalogService } from 'src/catalog/catalog.service';
import { AudioService } from 'src/audios/audio.service';
import { paginate } from 'src/common/helpers/pagination.helper';
import { Audio } from 'src/audios/entities/audio.entity';
import { CacheService } from 'src/common/services/cache.service';
import { AudioElasticsearchSyncService } from 'src/audios/audio-elasticsearch-sync.service';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { PharmaService } from 'src/pharma/services/pharma.service';
import { Video } from 'src/video/entities/video.entity';
import { AppElasticsearchService } from 'src/app-elasticsearch/services/app-elasticsearch.service';
import { CompanyService } from 'src/companies/company.service';
import { CacheKeys } from 'src/common/constants/cache-keys.constant';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,

    @Inject(forwardRef(() => AudioService))
    private audioService: AudioService,

    private readonly audioElasticsearchSyncService: AudioElasticsearchSyncService,
    private readonly catalogService: CatalogService,
    private readonly cacheService: CacheService,
    private readonly pharmaService: PharmaService,
    private readonly appElasticsearchService: AppElasticsearchService,

    @Inject(forwardRef(() => CompanyService))
    private readonly companyService: CompanyService,
  ) {}

  /**
   * Find all company IDs whose assigned catalogs include the given category ID,
   * then invalidate their company cache so the next request rebuilds with
   * the current active-category filter.
   * Also invalidates audio categories cache for affected companies.
   * Delegates to CompanyService which queries the DB directly via JSONB containment.
   */
  private async invalidateCompanyCacheForCategory(
    categoryId: string,
  ): Promise<void> {
    try {
      const companyIds =
        await this.companyService.findCompanyIdsByCategoryId(categoryId);

      // Invalidate both company cache and audio categories cache
      await CacheKeys.invalidateCompanyRelatedCaches(
        this.cacheService,
        companyIds,
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate company cache for category ${categoryId}`,
        error,
      );
    }
  }

  async findAll(): Promise<Category[]> {
    return this.categoryRepository.find();
  }

  async findById(id: string): Promise<Category | undefined> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    return category;
  }

  async findByIdWithCache(id: string) {
    const cachedCategory = await this.cacheService.get(id);

    if (cachedCategory) return cachedCategory;

    const category = await this.findById(id);
    const catalog = await this.catalogService.findByCategory(category);

    const data = {
      id: category.id,
      name: category.name,
      type: category.type,
      media_type: catalog.media_type,
      title_ids: [],
    };

    if (catalog.media_type === MEDIA.AUDIO) {
      data.title_ids = await this.audioService.getAudioIdsByCategory(
        category.id,
      );
    } else if (catalog.media_type === MEDIA.PHARMA) {
      data.title_ids = await this.pharmaService.getPharmaIdsByCategory(
        category.id,
      );
    }

    await this.cacheService.set(id, data);

    return data;
  }

  async findOne(id: string): Promise<CategoryDto | undefined> {
    const category = await this.categoryRepository.findOne({
      where: { id, is_active: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found.');
    }

    return plainToInstance(CategoryDto, category, {
      excludeExtraneousValues: true,
    });
  }

  async findEntitiesByIds(
    ids: string[],
    selects: (keyof Category)[] = [],
  ): Promise<Category[]> {
    if (!ids || ids.length === 0) return [];

    return this.categoryRepository.find({
      where: {
        id: In(ids),
        is_active: true,
      },
      select: selects.length > 0 ? selects : undefined,
    });
  }

  async findMany(ids: string[] = [], query: any = {}) {
    const sortOrder = ['asc', 'desc'].includes(query.sort_order?.toLowerCase())
      ? query.sort_order.toUpperCase()
      : 'ASC';

    const sortColumn = query.sort_column ? query.sort_column : 'name';

    const qb = this.categoryRepository.createQueryBuilder('category');

    qb.where('category.id IN (:...ids)', { ids });

    if (query.type) {
      qb.where('category.type = (:type)', { type: query.type });
    }

    if (query.name) {
      qb.andWhere('category.name ILIKE :name', {
        name: `%${query.name}%`,
      });
    }

    if (query.status === 'active') {
      qb.andWhere('category.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      qb.andWhere('category.is_active = :status', { status: false });
    }

    qb.orderBy(`category.${sortColumn}`, sortOrder);

    return paginate(qb, query.page, query.per_page, CategoryDto);
  }

  async create(payload: CreateCategoryDto): Promise<CategoryDto> {
    const catalog = await this.catalogService.findOne(payload.catalog_id);

    if (
      catalog.type === CATALOG_CATEGORY_TYPE.DEFAULT &&
      payload.type !== CATALOG_CATEGORY_TYPE.DEFAULT
    ) {
      throw new BadRequestException(
        'Only default category can be assigned into default catalog',
      );
    }

    if (
      catalog.type === CATALOG_CATEGORY_TYPE.CUSTOM &&
      payload.type !== CATALOG_CATEGORY_TYPE.CUSTOM
    ) {
      throw new BadRequestException(
        'Only custom category can be assigned into custom catalog',
      );
    }

    const category = this.categoryRepository.create({
      name: payload.name,
      type: payload.type,
      is_active: payload.is_active,
    });

    await this.categoryRepository.save(category);
    await this.catalogService.assignCategory(catalog, category);
    await this.findByIdWithCache(category.id);

    return plainToInstance(CategoryDto, category, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, payload: UpdateCategoryDto): Promise<CategoryDto> {
    const [catalog, category] = await Promise.all([
      this.catalogService.findOne(payload.catalog_id),
      this.findById(id),
    ]);

    if (!catalog.categories.includes(id)) {
      throw new BadRequestException(
        'The catalog does not contain the category',
      );
    }

    if (
      catalog.type === CATALOG_CATEGORY_TYPE.DEFAULT &&
      payload.type !== CATALOG_CATEGORY_TYPE.DEFAULT
    ) {
      throw new NotAcceptableException(
        'Only default category can be assigned into default catalog',
      );
    }

    if (
      catalog.type === CATALOG_CATEGORY_TYPE.CUSTOM &&
      payload.type === CATALOG_CATEGORY_TYPE.DEFAULT
    ) {
      throw new NotAcceptableException(
        'Default category can not be updated for custom catalog. First need to make custom.',
      );
    }

    if (
      catalog.type === CATALOG_CATEGORY_TYPE.CUSTOM &&
      category.type === CATALOG_CATEGORY_TYPE.DEFAULT &&
      payload.type === CATALOG_CATEGORY_TYPE.CUSTOM
    ) {
      const newCategory = await this.create({
        catalog_id: catalog.id,
        name: payload.name,
        type: payload.type,
        is_active: payload.is_active,
      });

      const updatedCatalog = await this.catalogService.findOne(catalog.id);

      await this.catalogService.removeCategory(updatedCatalog, id);
      await this.addCategoryToMatchingAudios(id, newCategory.id);

      await Promise.all([
        this.cacheService.delete(newCategory.id),
        this.cacheService.delete(id),
      ]);

      await Promise.all([
        this.findByIdWithCache(id),
        this.findByIdWithCache(newCategory.id),
      ]);

      // Sync audios for both old and new categories in background
      this.audioElasticsearchSyncService
        .syncAudiosByCategoryId(id)
        .catch((error) =>
          this.logger.error(
            `Failed to sync audios for old category ${id}`,
            error,
          ),
        );

      this.audioElasticsearchSyncService
        .syncAudiosByCategoryId(newCategory.id)
        .catch((error) =>
          this.logger.error(
            `Failed to sync audios for new category ${newCategory.id}`,
            error,
          ),
        );

      return plainToInstance(CategoryDto, newCategory, {
        excludeExtraneousValues: true,
      });
    }

    Object.assign(category, payload);
    await this.categoryRepository.save(category);

    // If is_active changed, invalidate company caches that reference this category
    if ('is_active' in payload) {
      this.invalidateCompanyCacheForCategory(id).catch((error) =>
        this.logger.error(
          `Background company cache invalidation failed for category ${id}`,
          error,
        ),
      );
    }

    return plainToInstance(CategoryDto, category, {
      excludeExtraneousValues: true,
    });
  }

  remove(id: string) {
    return `This action removes a #${id} category`;
  }

  async assign(id: string, mediaIds: string[]) {
    const category = await this.findById(id);
    const catalog = await this.catalogService.findByCategory(category);

    if (catalog.media_type === MEDIA.AUDIO) {
      await this.audioService.assignCategory(category, mediaIds);
      // Sync individual assigned audios to Elasticsearch
      try {
        await Promise.all(
          mediaIds.map((audioId) =>
            this.audioElasticsearchSyncService.syncAudioById(audioId),
          ),
        );
      } catch (error) {
        this.logger.error('Failed to sync audios after assign', error);
        throw error;
      }
    }

    if (catalog.media_type === MEDIA.PHARMA) {
      await this.pharmaService.assignCategory(category, mediaIds);
    }

    await this.cacheService.delete(id);
    await this.findByIdWithCache(id);

    // Invalidate company caches so category ID changes are reflected immediately
    this.invalidateCompanyCacheForCategory(id).catch((error) =>
      this.logger.error(
        `Background company cache invalidation failed after assign for category ${id}`,
        error,
      ),
    );

    // Wait for Elasticsearch indexing to complete before returning response
    const responseDelay =
      this.audioElasticsearchSyncService.getResponseDelayMs();
    if (responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelay));
    }
  }

  async deassign(id: string, mediaIds: string[]) {
    const category = await this.findById(id);
    const catalog = await this.catalogService.findByCategory(category);

    if (catalog.media_type === MEDIA.AUDIO) {
      await this.audioService.deassignCategory(category, mediaIds);
      // Sync individual deassigned audios to Elasticsearch
      // Note: Can't use syncAudiosByCategoryId after deassign because audios no longer contain this category
      try {
        await Promise.all(
          mediaIds.map((audioId) =>
            this.audioElasticsearchSyncService.syncAudioById(audioId),
          ),
        );
      } catch (error) {
        this.logger.error('Failed to sync audios after deassign', error);
        throw error;
      }
    }

    if (catalog.media_type === MEDIA.PHARMA) {
      await this.pharmaService.deassignCategory(category, mediaIds);
    }

    await this.cacheService.delete(id);
    await this.findByIdWithCache(id);

    // Invalidate company caches so category ID changes are reflected immediately
    this.invalidateCompanyCacheForCategory(id).catch((error) =>
      this.logger.error(
        `Background company cache invalidation failed after deassign for category ${id}`,
        error,
      ),
    );

    // Wait for Elasticsearch indexing to complete before returning response
    const responseDelay =
      this.audioElasticsearchSyncService.getResponseDelayMs();
    if (responseDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelay));
    }
  }

  async getTotalTitleCounts(
    categoryIds: string[],
    mediaType: Media,
  ): Promise<
    Record<string, { active: number; inactive: number; total: number }>
  > {
    if (categoryIds.length === 0) return {};

    let result: {
      category_id: string;
      active_count: number;
      inactive_count: number;
    }[] = [];

    if (mediaType === 'audio') {
      const esQuery = {
        index: 'es_audios',
        size: 0,
        query: {
          bool: {
            filter: [
              {
                terms: {
                  category_ids: categoryIds,
                },
              },
            ],
          },
        },
        aggs: {
          by_category: {
            terms: {
              field: 'category_ids',
              size: Math.max(categoryIds.length * 3, 1000),
              shard_size: Math.max(categoryIds.length * 5, 2000),
            },
            aggs: {
              active_count: {
                filter: {
                  term: { is_active: true },
                },
              },
              inactive_count: {
                filter: {
                  term: { is_active: false },
                },
              },
            },
          },
        },
      };

      const esResponse = await this.appElasticsearchService.search(esQuery);

      const buckets =
        (esResponse.aggregations?.by_category as any)?.buckets || [];
      result = buckets.map((bucket: any) => ({
        category_id: bucket.key,
        active_count: bucket.active_count?.doc_count || 0,
        inactive_count: bucket.inactive_count?.doc_count || 0,
      }));
    } else if (mediaType === 'pharma') {
      result = await this.pharmaRepository.query(
        `
        SELECT
            jsonb_array_elements_text(p.categories) AS category_id,
            COUNT(*) FILTER (WHERE p.is_active = true) AS active_count,
            COUNT(*) FILTER (WHERE p.is_active = false) AS inactive_count
        FROM pharmas p
        WHERE p.categories ?| $1
        GROUP BY category_id
        `,
        [categoryIds],
      );
    } else if (mediaType === 'video') {
      result = await this.videoRepository.query(
        `
        SELECT
            jsonb_array_elements_text(v.categories) AS category_id,
            COUNT(*) FILTER (WHERE v.is_active = true) AS active_count,
            COUNT(*) FILTER (WHERE v.is_active = false) AS inactive_count
        FROM videos v
        WHERE v.categories ?| $1
        GROUP BY category_id
        `,
        [categoryIds],
      );
    }

    return categoryIds.reduce(
      (acc, id) => {
        const row = result.find((r) => r.category_id === id);
        const active = Number(row?.active_count || 0);
        const inactive = Number(row?.inactive_count || 0);
        acc[id] = {
          active,
          inactive,
          total: active + inactive,
        };
        return acc;
      },
      {} as Record<string, { active: number; inactive: number; total: number }>,
    );
  }

  async addCategoryToMatchingAudios(
    existingCategory: string,
    newCategory: string,
  ) {
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
              SELECT '"${newCategory}"'::jsonb
            ) AS combined
          )
        `,
      })
      .where(`categories @> :existingCategory`, {
        existingCategory: JSON.stringify([existingCategory]),
      })
      .execute();
  }
}
