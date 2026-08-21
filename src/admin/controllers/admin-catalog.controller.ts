import { Controller, Get, UseGuards, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminCatalogService } from '../services/admin-catalog.service';
import { AdminCatalogPdfService } from '../services/admin-catalog-pdf.service';
import { Media } from 'src/constants';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/catalogs')
export class AdminCatalogController {
  constructor(
    private readonly adminCatalogService: AdminCatalogService,
    private readonly adminCatalogPdfService: AdminCatalogPdfService,
  ) {}

  @Get(':type/categories')
  async findCatalogCategories(@Param('type') type: Media, @Query() query: any) {
    return this.adminCatalogService.findCatalogCategories(type, query);
  }

  @Get(':type/pdf')
  async generatePdf(@Param('type') type: string, @Res() res: Response) {
    const buffer =
      await this.adminCatalogPdfService.generateDefaultCatalogPdf(type);
    const year = new Date().getFullYear();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="trl-${type}-catalog-${year}.pdf"`,
    );
    res.end(buffer);
  }
}
