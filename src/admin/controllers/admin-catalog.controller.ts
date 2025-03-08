import { Controller, Get, UseGuards, Param, Query } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminCatalogService } from '../services/admin-catalog.service';
import { Media } from 'src/constants';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/catalogs')
export class AdminCatalogController {
  constructor(private readonly adminCatalogService: AdminCatalogService) {}

  @Get(':type/categories')
  async findCatalogCategories(@Param('type') type: Media, @Query() query: any) {
    return this.adminCatalogService.findCatalogCategories(type, query);
  }
}
