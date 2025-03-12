import {
  Controller,
  Get,
  UseGuards,
  Query,
  Param,
  Put,
  Patch,
  Body,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminCompanyCatalogService } from '../services/admin-company-catalog.service';
import { UpdateCatalogDto } from 'src/catalog/dto/update-catalog.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/companies')
export class AdminCompanyCatalogController {
  constructor(
    private readonly adminCompanyCatalogService: AdminCompanyCatalogService,
  ) {}

  @Get(':id/catalogs')
  async findAll(@Param('id') id: string, @Query() query: any) {
    return this.adminCompanyCatalogService.findAll(id, query);
  }

  @Get(':companyId/catalogs/:id')
  async show(
    @Param('companyId') companyId: string,
    @Param('id') id: number,
    @Query() query: any,
  ) {
    return this.adminCompanyCatalogService.show(companyId, id, query);
  }

  @Patch(':companyId/catalogs/:id')
  update(
    @Param('companyId') companyId: string,
    @Param('id') id: number,
    @Body() payload: UpdateCatalogDto,
  ) {
    return this.adminCompanyCatalogService.update(companyId, id, payload);
  }
}
