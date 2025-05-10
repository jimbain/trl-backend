import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { CompanyService } from 'src/companies/company.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { CreateCompanyDto } from 'src/companies/dto/create-company.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { UpdateCompanyDto } from 'src/companies/dto/update-company.dto';
import { UpdateCompanyAppConfigDto } from '../dto/company/update-company-app-config.dto';
import { AdminCompanySearchQueryDto } from '../dto/company/admin-company-query.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/companies')
export class AdminCompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  findAll(@Query() query: AdminCompanySearchQueryDto) {
    return this.companyService.findAll(query);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: {
        fileSize: 300 * 1024, // 300KB limit
      },
    }),
  )
  store(@UploadedFile() logo, @Body() payload: CreateCompanyDto) {
    return this.companyService.create(payload, logo);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companyService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(
    FileInterceptor('logo', {
      limits: {
        fileSize: 300 * 1024, // 300KB limit
      },
    }),
  )
  async update(
    @Param('id') id: string,
    @UploadedFile() logo: Express.Multer.File,
    @Body() payload: UpdateCompanyDto,
  ) {
    return this.companyService.update(id, logo, payload);
  }

  @Get(':id/credit-logs')
  findAllCreditLogs(@Param('id') id: string) {
    return this.companyService.findAllCreditLogs(id);
  }

  @Patch(':id/configurations')
  updateAppConfigurations(
    @Param('id') id: string,
    @Body() payload: UpdateCompanyAppConfigDto,
  ) {
    return this.companyService.updateAppConfigurations(id, payload);
  }
}
