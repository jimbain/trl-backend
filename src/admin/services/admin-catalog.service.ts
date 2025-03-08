import { Injectable } from '@nestjs/common';
import { CatalogService } from 'src/catalog/catalog.service';
import { CategoryService } from 'src/categories/category.service';
import { Media } from 'src/constants';

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly categoryService: CategoryService,
  ) {}

  async findCatalogCategories(type: Media, query: any = {}) {
    const catalog = await this.catalogService.findDefaultByType(type);
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
      total_titles: totalTitlesMap[category.id] || 0, // Default to 0 if not found
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
