import {
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { Repository } from 'typeorm';
import { CategoryDto } from './dto/category.dto';
import { plainToInstance } from 'class-transformer';
import {
  CATALOG_CATEGORY_TYPE,
  CatalogCategoryType,
  MEDIA,
} from 'src/constants';
import { CatalogService } from 'src/catalog/catalog.service';
import { AudioService } from 'src/audios/audio.service';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

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

  async findMany(
    ids: string[] = [],
    name: string = null,
    status: 'active' | 'inactive' | 'all' | null = null,
    type: CatalogCategoryType = CATALOG_CATEGORY_TYPE.DEFAULT,
  ): Promise<CategoryDto[]> {
    if (!ids.length) return [];

    const qb = this.categoryRepository.createQueryBuilder('category');
    qb.where('category.id IN (:...ids)', { ids });
    qb.where('category.type = (:type)', { type });

    if (name) {
      qb.andWhere('LOWER(category.name) LIKE LOWER(:name)', {
        name: `%${name}%`,
      });
    }

    if (status === 'active') {
      qb.andWhere('category.is_active = :status', { status: true });
    } else if (status === 'inactive') {
      qb.andWhere('category.is_active = :status', { status: false });
    }

    qb.orderBy('category.created_at', 'DESC');

    const categories = await qb.getMany();

    return plainToInstance(CategoryDto, categories, {
      excludeExtraneousValues: true,
    });
  }

  async create(payload: CreateCategoryDto): Promise<CategoryDto> {
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

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    const category = await this.findById(id);
    Object.assign(category, updateCategoryDto);
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
}
