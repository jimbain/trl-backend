import {
  Controller,
  Get,
  UseGuards,
  Query,
  Param,
  Patch,
  Body,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminCompanyCatalogService } from '../services/admin-company-catalog.service';
import { AdminCatalogPdfService } from '../services/admin-catalog-pdf.service';
import { UpdateCatalogDto } from 'src/catalog/dto/update-catalog.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/companies')
export class AdminCompanyCatalogController {
  constructor(
    private readonly adminCompanyCatalogService: AdminCompanyCatalogService,
    private readonly adminCatalogPdfService: AdminCatalogPdfService,
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

  @Get(':companyId/catalogs/:id/pdf')
  async generatePdf(
    @Param('companyId') companyId: string,
    @Param('id') id: number,
    @Res() res: Response,
  ) {
    // Assert the catalog actually belongs to this company before rendering.
    // show() and update() both enforce this; only the PDF route skipped it, so
    // /companies/ACME/catalogs/99/pdf would return catalog 99 in a file named
    // after ACME. Not privilege escalation — every admin route shares one
    // guard and there is no role system — but a mislabelled catalog sent to a
    // client is a commercial problem.
    await this.adminCompanyCatalogService.assertCatalogAccess(
      companyId,
      Number(id),
    );

    const buffer = await this.adminCatalogPdfService.generateCompanyCatalogPdf(
      Number(id),
    );
    const year = new Date().getFullYear();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="trl-catalog-company-${companyId}-${year}.pdf"`,
    );
    res.end(buffer);
  }
}
