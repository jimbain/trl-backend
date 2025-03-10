import { BadRequestException, Injectable } from '@nestjs/common';
import { CompanyService } from 'src/companies/company.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { plainToInstance } from 'class-transformer';
import { AdminCompanyCatalogDto } from '../dto/catalog/admin-company-catalog.dto';
import { CategoryService } from 'src/categories/category.service';

@Injectable()
export class AdminCompanyCatalogService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly catalogService: CatalogService,
    private readonly categoryService: CategoryService,
  ) {}

  async findAll(id: string, query: any = {}) {
    const company = await this.companyService.findById(id);
    const catalogs = await this.catalogService.findEntitiesByIds(
      company.catalogs,
    );

    const catalogsWithTitles = await Promise.all(
      catalogs.map(async (catalog) => {
        const totalTitles =
          await this.catalogService.getTotalTitleCount(catalog);
        return {
          ...catalog,
          total_titles: totalTitles,
        };
      }),
    );

    return plainToInstance(AdminCompanyCatalogDto, catalogsWithTitles, {
      excludeExtraneousValues: true,
    });
  }

  async show(companyId: string, id: number, query: any = {}) {
    const company = await this.companyService.findById(companyId);

    if (!company.catalogs.includes(id)) {
      throw new BadRequestException(
        'The catalog is not assigned to the company',
      );
    }

    const catalog = await this.catalogService.findOne(id);

    if (catalog.categories.length === 0) {
      return {
        id: catalog.id,
        name: catalog.name,
        categories: {
          data: [],
          meta: {},
        },
      };
    }

    const categories: any = await this.categoryService.findMany(
      catalog.categories,
      query,
    );

    const categoryMeta = categories.meta;
    const categoryData = categories.data;

    if (categoryData.length === 0) {
      return {
        id: catalog.id,
        name: catalog.name,
        categories: {
          data: [],
          meta: categoryMeta,
        },
      };
    }

    // Extract category IDs
    const categoryIds = categoryData.map((category: any) => category.id);

    // Fetch total title counts in a single query
    const totalTitlesMap = await this.categoryService.getTotalTitleCounts(
      categoryIds,
      catalog.media_type,
    );

    // Merge total_titles into categories
    const categoryDataWithTitles = categoryData.map((category: any) => ({
      ...category,
      total_titles: totalTitlesMap[category.id] || 0,
    }));

    return {
      id: catalog.id,
      name: catalog.name,
      categories: {
        data: categoryDataWithTitles,
        meta: categoryMeta,
      },
    };
  }
}
