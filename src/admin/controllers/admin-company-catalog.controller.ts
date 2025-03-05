import { Controller, Get, UseGuards, Query, Param } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { CatalogService } from 'src/catalog/catalog.service';
import { CompanyService } from 'src/companies/company.service';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/companies')
export class AdminCompanyCatalogController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly catalogService: CatalogService,
  ) {}

  @Get(':id/catalogs')
  async findAll(@Param('id') id: string, @Query() query: any) {
    const company = await this.companyService.findById(id);
    return this.catalogService.findByIds(company.catalogs);
  }
}
