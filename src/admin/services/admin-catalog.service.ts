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
