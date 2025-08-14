import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pharma } from './entities/pharma.entity';
import { StorageService } from 'src/storage/storage.service';
import { PharmaDto, PharmaListDto } from './dto/pharma.dto';
import { PaginationMeta } from 'src/common/interfaces';
import { paginate } from 'src/common/helpers/pagination.helper';
import { plainToInstance } from 'class-transformer';
import { CompanyService } from 'src/companies/company.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { CategoryService } from 'src/categories/category.service';
import { MEDIA } from 'src/constants';
import { PharmaCategoryDto } from './dto/pharma-category.dto';
import { User } from 'src/users/entities/user.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { PharmaUserStatus } from './entities/pharma-user-status.entity';
import { QueryPharmaDto } from './dto/query-pharma.dto';

@Injectable()
export class PharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    private readonly appConfigService: AppConfigService,
    private readonly companyService: CompanyService,
    private readonly catalogService: CatalogService,
    private readonly categoryService: CategoryService,
    private readonly storageService: StorageService,
  ) {}
  async findAll(
    query: QueryPharmaDto,
    user: User,
  ): Promise<{
    data: PharmaListDto[];
    meta: PaginationMeta;
  }> {
    const { page, per_page, category_ids, is_featured } = query;

    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );

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
        'pharma.title AS title',
        'pharma.image_url AS image_url',
        'pharmaUserStatus.status AS status',
        'pharmaUserStatus.current_rental_expire_at AS current_rental_expire_at',
        'pharmaUserStatus.next_rental_expire_at AS next_rental_expire_at',
      ]);

    if (is_featured !== undefined) {
      queryBuilder.andWhere('pharma.is_featured = :isFeatured', {
        isFeatured: is_featured,
      });
    }

    if (category_ids && category_ids.length > 0) {
      queryBuilder.andWhere(
        `array(SELECT jsonb_array_elements_text(pharma.categories)) && :categoryIds`,
        { categoryIds: JSON.stringify(category_ids) },
      );
    }

    const paginatedData = await paginate(
      queryBuilder,
      page,
      per_page,
      PharmaListDto,
    );

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

  async findOne(id: string): Promise<PharmaDto> {
    const pharma = await this.findById(id);
    const transformedPharma = await this.getTransformed(pharma);

    return plainToInstance(PharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
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
    const company = await this.companyService.findById(companyId);
    const catalogs = await this.catalogService.findMany(company.catalogs);
    const pharmaCatalog =
      catalogs.find((catalog) => catalog.media_type === MEDIA.PHARMA) ?? null;

    const categories = await this.categoryService.findEntitiesByIds(
      pharmaCatalog.categories,
    );

    return plainToInstance(PharmaCategoryDto, categories, {
      excludeExtraneousValues: true,
    });
  }

  async findPharmasByCategory(
    user: User,
    categoryId: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{
    category: { id: string; title: string };
    data: PharmaListDto[];
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

    if (categoryId !== 'category_0' && categoryIds.includes(categoryId)) {
      categoryIds = [categoryId];
      category = await this.categoryService.findOne(categoryId);
    }

    if (!categoryIds.length) {
      throw new NotFoundException(
        `Category with ID ${categoryId} not found for your company`,
      );
    }

    const queryBuilder = this.pharmaRepository
      .createQueryBuilder('pharma')
      .leftJoinAndMapOne(
        'pharma.userStatuses',
        PharmaUserStatus,
        'pharmaUserStatus',
        'pharmaUserStatus.pharma_id = pharma.id AND pharmaUserStatus.user_id = :userId',
        { userId: user.id },
      )
      .where(
        `array(SELECT jsonb_array_elements_text(pharma.categories)) && :categoryIds`,
        { categoryIds: categoryIds },
      )
      .andWhere('pharma.is_active = :isActive', { isActive: true })
      .select([
        'pharma.id AS id',
        'pharma.title AS title',
        'pharma.image_url AS image_url',
        'pharmaUserStatus.status AS status',
        'pharmaUserStatus.current_rental_expire_at AS current_rental_expire_at',
        'pharmaUserStatus.next_rental_expire_at AS next_rental_expire_at',
      ]);

    const paginatedData = await paginate(
      queryBuilder,
      page,
      limit,
      PharmaListDto,
    );

    paginatedData.data = await Promise.all(
      paginatedData.data.map(async (item) => ({
        ...item,
        image_url: item.image_url
          ? await this.storageService.generateSignedViewUrl(item.image_url)
          : null,
        rental_credit_cost: appConfigs.pharma_rental_credit_cost,
      })),
    );

    return {
      category: {
        id: categoryId,
        title: categoryId !== 'category_0' ? category?.name : 'All categories',
      },
      ...paginatedData,
    };
  }

  async findPharmaReviews(id: string, user: User): Promise<AudioReviewDto[]> {
    const audio = await this.audioService.findById(audioId);

    // Find the current user's review, if it exists
    const userReview = await this.audioReviewRepository.findOne({
      where: { audio_id: audio.id, user: { id: user.id }, review: Not('null') },
      relations: ['user'],
    });

    // Find other reviews, excluding the current user's review, sorted by created_at descending
    const otherReviews = await this.audioReviewRepository.find({
      where: {
        audio_id: audio.id,
        user: { id: Not(user.id) },
        review: Not('null'),
      },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });

    // Combine the reviews with the current user's review first, if it exists
    const reviews = userReview ? [userReview, ...otherReviews] : otherReviews;

    return plainToInstance(AudioReviewDto, reviews, {
      excludeExtraneousValues: true,
    });
  }

  async storeAudioReview(
    audioId: string,
    payload: CreateAudioReview,
    user: User,
  ): Promise<{ average_review_rating: number; review: AudioReviewDto }> {
    const audio = await this.audioService.findById(audioId);

    const review = await this.audioReviewRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });

    if (review) {
      throw new ConflictException(
        'You have already submitted a review for this audio.',
      );
    }

    let newReview = this.audioReviewRepository.create({
      audio: audio,
      user: user,
      ...payload,
    });

    newReview = await this.audioReviewRepository.save(newReview);

    return {
      average_review_rating: await this.updateAverageReviewRate(audio),
      review: plainToInstance(AudioReviewDto, newReview, {
        excludeExtraneousValues: true,
      }),
    };
  }
}
