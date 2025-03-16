import {
  BadRequestException,
  Inject,
  Injectable,
  NotAcceptableException,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { In, Raw, Repository } from 'typeorm';
import { CategoryDto } from './dto/category.dto';
import { plainToInstance } from 'class-transformer';
import {
  CATALOG_CATEGORY_TYPE,
  CatalogCategoryType,
  MEDIA,
  Media,
} from 'src/constants';
import { CatalogService } from 'src/catalog/catalog.service';
import { AudioService } from 'src/audios/audio.service';
import { paginate } from 'src/common/helpers/pagination.helper';
import { Audio } from 'src/audios/entities/audio.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @Inject(forwardRef(() => AudioService))
    private audioService: AudioService,

    private readonly catalogService: CatalogService,
  ) {}

  async findAll(): Promise<Category[]> {
    return this.categoryRepository.find();
  }

  async findById(id: string): Promise<Category | undefined> {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  async findOne(id: string): Promise<CategoryDto | undefined> {
    const category = await this.categoryRepository.findOne({
      where: { id, is_active: true },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return plainToInstance(CategoryDto, category, {
      excludeExtraneousValues: true,
    });
  }

  async findEntitiesByIds(ids: string[]): Promise<Category[]> {
    if (!ids || ids.length === 0) return [];

    return this.categoryRepository.find({
      where: { id: In(ids) },
    });
  }

  async findMany(ids: string[] = [], query: any = {}) {
    const qb = this.categoryRepository.createQueryBuilder('category');
    qb.where('category.id IN (:...ids)', { ids });

    if (query.type) {
      qb.where('category.type = (:type)', { type: query.type });
    }

    if (query.category_name) {
      qb.andWhere('LOWER(category.name) LIKE LOWER(:name)', {
        name: `%${query.category_name}%`,
      });
    }

    if (query.status === 'active') {
      qb.andWhere('category.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      qb.andWhere('category.is_active = :status', { status: false });
    }

    qb.orderBy('category.created_at', 'DESC');

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

    const category = this.categoryRepository.create({
      name: payload.name,
      type: payload.type,
      is_active: payload.is_active,
    });

    await this.categoryRepository.save(category);
    await this.catalogService.assignCategory(payload.catalog_id, category);

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

      await this.catalogService.removeCategory(catalog, id);
      await this.addCategoryToMatchingAudios(id, newCategory.id);
    }

    Object.assign(category, payload);
    await this.categoryRepository.save(category);

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
      return this.audioService.assignCategory(category, mediaIds);
    }
  }

  async deassign(id: string, mediaIds: string[]) {
    const category = await this.findById(id);
    const catalog = await this.catalogService.findByCategory(category);

    if (catalog.media_type === MEDIA.AUDIO) {
      return this.audioService.deassignCategory(category, mediaIds);
    }
  }

  async getTotalTitleCounts(
    categoryIds: string[],
    mediaType: Media,
  ): Promise<Record<string, number>> {
    if (categoryIds.length === 0) return {};

    let result: { category_id: string; count: number }[] = [];

    if (mediaType === 'audio') {
      result = await this.audioRepository.query(
        `
        SELECT 
            jsonb_array_elements_text(a.categories) AS category_id, 
            COUNT(*) AS count
        FROM audios a
        WHERE a.categories ?| $1
        GROUP BY category_id
        `,
        [categoryIds],
      );
    } else if (mediaType === 'video') {
    } else if (mediaType === 'pharma') {
    }

    return categoryIds.reduce(
      (acc, id) => {
        acc[id] = Number(
          result.find((row) => row.category_id === id)?.count || 0,
        );
        return acc;
      },
      {} as Record<string, number>,
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
