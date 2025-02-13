import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { In, Repository } from 'typeorm';
import { CategoryDto } from './dto/category.dto';
import { plainToInstance } from 'class-transformer';

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

  async findMany(ids: string[]): Promise<CategoryDto[]> {
    console.log('ids', ids);
    if (!ids.length) return [];

    const categories = await this.categoryRepository.find({
      where: {
        id: In(ids),
        is_active: true,
      },
    });

    console.log('categories', categories);
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
