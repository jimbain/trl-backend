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
    const categories: any = await this.categoryService.findMany(
      catalog.categories,
      query,
    );

    const categoryMeta = categories.meta;
    const categoryData = categories.data;

    const categoryDataWithTitles = await Promise.all(
      categoryData.map(async (category: any) => {
        const totalTitles = await this.categoryService.getTotalTitleCount(
          category.id,
          catalog.media_type,
        );
        return {
          ...category,
          total_titles: totalTitles,
        };
      }),
    );

    return {
      id: catalog.id,
      name: catalog.name,
      categories: {
        data: categoryDataWithTitles,
        meat: categoryMeta,
      },
    };
  }
}
