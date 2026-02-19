import { BadRequestException, Injectable } from '@nestjs/common';
import { CompanyService } from 'src/companies/company.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { plainToInstance } from 'class-transformer';
import { AdminCompanyCatalogDto } from '../dto/catalog/admin-company-catalog.dto';
import { CategoryService } from 'src/categories/category.service';
import { UpdateCatalogDto } from 'src/catalog/dto/update-catalog.dto';
import { CATALOG_CATEGORY_TYPE } from 'src/constants';
import { CacheService } from 'src/common/services/cache.service';
import { CacheKeys } from 'src/common/constants/cache-keys.constant';

@Injectable()
export class AdminCompanyCatalogService {
  constructor(
    private readonly companyService: CompanyService,
    private readonly catalogService: CatalogService,
    private readonly categoryService: CategoryService,
    private readonly cacheService: CacheService,
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
    const categoryIds = catalog.categories;

    // Initialize response structure
    const response = {
      id: catalog.id,
      name: catalog.name,
      type: catalog.type,
      media_type: catalog.media_type,
      categories: {
        data: [],
        meta: {},
      },
    };

    if (categoryIds.length === 0) return response;

    // Fetch categories and metadata
    const { data: categoryData, meta: categoryMeta } =
      await this.categoryService.findMany(categoryIds, query);

    response.categories.meta = categoryMeta;
    if (categoryData.length === 0) return response;

    // Fetch total title counts in a single query
    const totalTitlesMap = await this.categoryService.getTotalTitleCounts(
      categoryData.map((category: any) => category.id),
      catalog.media_type,
    );

    // Add `total_titles` to categories
    response.categories.data = categoryData.map((category: any) => ({
      ...category,
      total_titles: totalTitlesMap[category.id] || 0,
    }));

    return response;
  }

  async update(companyId: string, id: number, payload: UpdateCatalogDto) {
    const company = await this.companyService.findById(companyId);

    if (!company.catalogs.includes(id)) {
      throw new BadRequestException(
        'The catalog is not assigned to the company',
      );
    }

    const catalog = await this.catalogService.findOne(id);

    if (
      catalog.type === CATALOG_CATEGORY_TYPE.DEFAULT &&
      payload.type === CATALOG_CATEGORY_TYPE.DEFAULT
    ) {
      throw new BadRequestException(
        "You can't edit the default catalog for a company.",
      );
    }

    let updatedCatalogId = id;

    switch (true) {
      case catalog.type === CATALOG_CATEGORY_TYPE.DEFAULT &&
        payload.type === CATALOG_CATEGORY_TYPE.CUSTOM:
        const clonedCatalog =
          await this.catalogService.cloneDefaultCatalogToCustom(
            payload,
            catalog,
          );
        updatedCatalogId = clonedCatalog.id;
        break;

      case catalog.type === CATALOG_CATEGORY_TYPE.CUSTOM &&
        payload.type === CATALOG_CATEGORY_TYPE.DEFAULT:
        const sameMediaTypeDefaultCatalog =
          await this.catalogService.replaceCustomWithDefault(catalog);
        updatedCatalogId = sameMediaTypeDefaultCatalog.id;
        break;

      case catalog.type === CATALOG_CATEGORY_TYPE.CUSTOM:
        await this.catalogService.update(catalog.id, payload);
        break;
    }

    company.catalogs = company.catalogs.map((catalogId) =>
      catalogId === id ? updatedCatalogId : catalogId,
    );
    await this.companyService.save(company);

    // Invalidate company cache and audio categories cache so the next request rebuilds with updated catalog/category data
    await CacheKeys.invalidateCompanyRelatedCaches(this.cacheService, [
      companyId,
    ]);
  }
}
