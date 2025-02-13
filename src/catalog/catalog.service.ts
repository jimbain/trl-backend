import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CatalogDto } from './dto/catalog.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
  ) {}

  async findByIds(ids: number[]): Promise<CatalogDto[]> {
    if (!ids || ids.length === 0) return [];

    const catalogs = await this.catalogRepository.find({
      where: { id: In(ids) },
    });

    return plainToInstance(CatalogDto, catalogs, {
      excludeExtraneousValues: true,
    });
  }

  async findAll(): Promise<Catalog[]> {
    return this.catalogRepository.find();
  }

  async findOne(id: number): Promise<Catalog> {
    const catalog = await this.catalogRepository.findOne({ where: { id } });

    if (!catalog) {
      throw new NotFoundException(`Catalog with ID ${id} not found`);
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

  async create(data: Partial<Catalog>): Promise<Catalog> {
    const catalog = this.catalogRepository.create(data);
    return await this.catalogRepository.save(catalog);
  }

  async update(id: number, data: Partial<Catalog>): Promise<Catalog> {
    await this.findOne(id); // Ensure catalog exists
    await this.catalogRepository.update(id, data);
    return this.findOne(id); // Return updated catalog
  }

  async remove(id: number): Promise<void> {
    const catalog = await this.findOne(id);
    await this.catalogRepository.remove(catalog);
  }
}
