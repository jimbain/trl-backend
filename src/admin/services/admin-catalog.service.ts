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
    const { is_basic } = query;
    const catalog = await this.catalogService.findDefaultByType(type);

    if (is_basic === '1') {
      const categories = await this.categoryService.findEntitiesByIds(
        catalog.categories,
        ['id', 'name'],
      );
      // Sort categories alphabetically by name (ascending)
      return categories.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (!catalog.categories || catalog.categories.length === 0) {
      return {
        id: catalog.id,
        name: catalog.name,
        categories: {
          data: [],
          meta: {
            current_page: 1,
            per_page: query.per_page || 20,
            total: 0,
            last_page: 1,
            from: 0,
            to: 0,
          },
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
      total_titles: totalTitlesMap[category.id] || {
        active: 0,
        inactive: 0,
        total: 0,
      },
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
