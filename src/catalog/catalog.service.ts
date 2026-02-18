import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Repository, In, Raw } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CatalogDto } from './dto/catalog.dto';
import { plainToInstance } from 'class-transformer';
import { CATALOG_CATEGORY_TYPE } from 'src/constants';
import { Category } from 'src/categories/entities/category.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UpdateCatalogDto } from './dto/update-catalog.dto';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { Video } from 'src/video/entities/video.entity';
import { AppElasticsearchService } from 'src/app-elasticsearch/services/app-elasticsearch.service';
import { CompanyService } from 'src/companies/company.service';

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,

    private readonly appElasticsearchService: AppElasticsearchService,

    @Inject(forwardRef(() => CompanyService))
    private readonly companyService: CompanyService,
  ) {}

  /**
   * Invalidate company caches for all companies that have this catalog assigned.
   * Delegates to CompanyService which queries the DB directly via JSONB containment.
   */
  private async invalidateCompanyCacheForCatalog(
    catalogId: number,
  ): Promise<void> {
    try {
      const companyIds =
        await this.companyService.findCompanyIdsByCatalogId(catalogId);
      await Promise.all(
        companyIds.map((id) => this.companyService.removeFromCacheById(id)),
      );
    } catch (error) {
      this.logger.error(
        `Failed to invalidate company cache for catalog ${catalogId}`,
        error,
      );
    }
  }

  async findAll(): Promise<Catalog[]> {
    return this.catalogRepository.find();
  }

  async findEntitiesByIds(ids: number[]): Promise<Catalog[]> {
    if (!ids || ids.length === 0) return [];

    return this.catalogRepository.find({
      where: { id: In(ids) },
    });
  }

  async findByIds(ids: number[]): Promise<CatalogDto[]> {
    const catalogs = await this.findEntitiesByIds(ids);

    return plainToInstance(CatalogDto, catalogs, {
      excludeExtraneousValues: true,
    });
  }

  async findOne(id: number): Promise<Catalog> {
    const catalog = await this.catalogRepository.findOne({ where: { id } });

    if (!catalog) {
      throw new NotFoundException(`Catalog with ID ${id} not found`);
    }

    return catalog;
  }

  async findByCategory(category: Category): Promise<Catalog> {
    const catalog = await this.catalogRepository
      .createQueryBuilder('catalog')
      .where(
        `array(SELECT jsonb_array_elements_text(catalog.categories)) && :categoryIds`,
        { categoryIds: [category.id] },
      )
      .getOne();

    if (!catalog) {
      throw new NotFoundException(
        `Catalog with Category ID ${category.id} not found`,
      );
    }

    return catalog;
  }

  async findMany(ids: number[]): Promise<Catalog[]> {
    if (!ids.length) return [];

    return this.catalogRepository.find({
      where: {
        id: In(ids),
        is_active: true,
      },
    });
  }

  async findByMedia(types: string[]): Promise<Catalog[]> {
    if (!types.length) return [];

    return this.catalogRepository.find({
      where: {
        type: CATALOG_CATEGORY_TYPE.DEFAULT,
        media_type: In(types),
        is_active: true,
      },
    });
  }

  async findDefaultByType(
    mediaType: 'audio' | 'video' | 'pharma',
  ): Promise<Catalog> {
    const catalog = await this.catalogRepository.findOne({
      where: {
        type: CATALOG_CATEGORY_TYPE.DEFAULT,
        media_type: mediaType,
        is_active: true,
      },
    });

    if (!catalog) {
      throw new NotFoundException(`Catalog of type ${mediaType} not found`);
    }

    return catalog;
  }

  async create(data: Partial<Catalog>): Promise<Catalog> {
    const catalog = this.catalogRepository.create(data);
    return await this.catalogRepository.save(catalog);
  }

  async update(id: number, data: UpdateCatalogDto): Promise<Catalog> {
    await this.findOne(id); // Ensure catalog exists
    await this.catalogRepository.update(id, data);

    // If is_active changed, invalidate company caches that reference this catalog
    if ('is_active' in data) {
      this.invalidateCompanyCacheForCatalog(id).catch((error) =>
        this.logger.error(
          `Background company cache invalidation failed for catalog ${id}`,
          error,
        ),
      );
    }

    return this.findOne(id); // Return updated catalog
  }

  async cloneDefaultCatalogToCustom(
    payload: { name: string; is_active: boolean },
    catalog: Catalog,
  ) {
    return this.create({
      name: payload.name,
      type: CATALOG_CATEGORY_TYPE.CUSTOM,
      media_type: catalog.media_type,
      categories: catalog.categories,
      is_active: payload.is_active,
    });
  }

  async replaceCustomWithDefault(catalog: Catalog) {
    const sameMediaDefaultCatalog = await this.findDefaultByType(
      catalog.media_type,
    );
    await this.removeByEntity(catalog);
    return sameMediaDefaultCatalog;
  }

  async remove(id: number): Promise<void> {
    const catalog = await this.findOne(id);
    await this.catalogRepository.remove(catalog);
  }

  removeByEntity(catalog: Catalog) {
    return this.catalogRepository.remove(catalog);
  }

  assignCategory(catalog: Catalog, category: Category): Promise<Catalog> {
    catalog.categories.push(category.id);
    catalog.categories = [...new Set(catalog.categories)];

    return this.catalogRepository.save(catalog);
  }

  removeCategory(catalog: Catalog, categoryId: string): Promise<Catalog> {
    catalog.categories = catalog.categories.filter(
      (category) => category !== categoryId,
    );
    catalog.categories = [...new Set(catalog.categories)];

    return this.catalogRepository.save(catalog);
  }

  async getTotalTitleCount(catalog: Catalog): Promise<number> {
    if (!catalog.categories || catalog.categories.length === 0) {
      return 0;
    }

    if (catalog.media_type === 'audio') {
      const { hits } = await this.appElasticsearchService.search({
        index: 'es_audios',
        size: 0,
        track_total_hits: true,
        query: {
          bool: {
            filter: [
              {
                terms: {
                  category_ids: catalog.categories,
                },
              },
            ],
          },
        },
      });

      return typeof hits.total === 'number'
        ? hits.total
        : (hits.total?.value ?? 0);
    } else if (catalog.media_type === 'pharma') {
      return this.pharmaRepository.count({
        where: {
          categories: Raw((alias) => `${alias} ?| array[:...categories]`, {
            categories: catalog.categories,
          }),
        },
      });
    } else if (catalog.media_type === 'video') {
      return this.videoRepository.count({
        where: {
          categories: Raw((alias) => `${alias} ?| array[:...categories]`, {
            categories: catalog.categories,
          }),
        },
      });
    }

    return 0;
  }
}
