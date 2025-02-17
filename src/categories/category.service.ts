import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { In, Repository } from 'typeorm';
import { CategoryDto } from './dto/category.dto';
import { plainToInstance } from 'class-transformer';
import { CATALOG_CATEGORY_TYPE, CatalogCategoryType } from 'src/constants';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async findAll(): Promise<Category[]> {
    return this.categoryRepository.find();
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

  create(createCategoryDto: CreateCategoryDto) {
    return 'This action adds a new category';
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    return `This action updates a #${id} category`;
  }

  remove(id: string) {
    return `This action removes a #${id} category`;
  }
}
