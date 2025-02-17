import { Controller, Get, UseGuards, Param, Query } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { CatalogService } from 'src/catalog/catalog.service';
import { CategoryService } from 'src/categories/category.service';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/catalogs')
export class AdminCatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly categoryService: CategoryService,
  ) {}

  @Get(':type/categories')
  async findCatalogCategories(
    @Param('type') type: 'audio' | 'video' | 'pharma',
    @Query('category_name') categoryName: string,
    @Query('status') status: 'active' | 'inactive' | 'all' | null,
  ) {
    const catalog = await this.catalogService.findDefaultByType(type);
    const categories = await this.categoryService.findMany(
      catalog.categories,
      categoryName,
      status,
    );

    return {
      id: catalog.id,
      name: catalog.name,
      categories: categories,
    };
  }
}
