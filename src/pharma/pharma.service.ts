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

@Injectable()
export class PharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    private readonly companyService: CompanyService,
    private readonly catalogService: CatalogService,
    private readonly categoryService: CategoryService,
    private readonly storageService: StorageService,
  ) {}
  async findAll(query: any = {}): Promise<{
    data: PharmaListDto[];
    meta: PaginationMeta;
  }> {
    const { page, per_page } = query;

    const queryBuilder = this.pharmaRepository
      .createQueryBuilder('pharma')
      .where('pharma.is_active = true')
      .orderBy('created_at', 'DESC');

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

  async findAllAudioCategoriesForCompany(companyId: string) {
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

    if (categoryId !== 'category_0' && categoryIds.includes(categoryId)) {
      categoryIds = [categoryId];
      category = await this.categoryService.findOne(categoryId);
    }

    if (!categoryIds.length) {
      throw new NotFoundException(
        `Category with ID ${categoryId} not found for your company`,
      );
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
      .andWhere('audio.is_active = :isActive', { isActive: true })
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
      ]);

    const paginatedData = await paginate(queryBuilder, page, limit);

    paginatedData.data = paginatedData.data.map((audio) =>
      plainToInstance(
        AudioListDto,
        { ...audio, rental_credit_cost: appConfigs.audio_rental_credit_cost },
        { excludeExtraneousValues: true },
      ),
    );

    return {
      category: {
        id: categoryId,
        title: categoryId !== 'category_0' ? category?.name : 'All categories',
      },
      ...paginatedData,
    };
  }
}
