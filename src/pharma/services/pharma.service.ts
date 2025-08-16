import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pharma } from '../entities/pharma.entity';
import { StorageService } from 'src/storage/storage.service';
import { PharmaDto, PharmaListDto } from '../dto/pharma.dto';
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

@Injectable()
export class PharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    private readonly appConfigService: AppConfigService,
    private readonly companyService: CompanyService,
    @Inject(forwardRef(() => CategoryService))
    private readonly categoryService: CategoryService,
    private readonly storageService: StorageService,
  ) {}

  async findAllPharmaCategoryIdOfCompany(companyId: string): Promise<string[]> {
    const company = await this.companyService.findByIdWithCache(companyId);
    return company.category_ids.pharma || [];
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
      queryBuilder.andWhere('pharma.avg_rating > 0');
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
      queryBuilder.orderBy('pharma.avg_rating', 'DESC');
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

  async findAllPharmaCategoryForCompany(companyId: string) {
    const categoryIds = await this.findAllPharmaCategoryIdOfCompany(companyId);

    if (!categoryIds.length) {
      return [];
    }

    const categories =
      await this.categoryService.findEntitiesByIds(categoryIds);

    return plainToInstance(PharmaCategoryDto, categories, {
      excludeExtraneousValues: true,
    });
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
}
