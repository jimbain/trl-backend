import { Module, forwardRef } from '@nestjs/common';
import { CompanyService } from './company.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { CatalogModule } from 'src/catalog/catalog.module';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CompanyCreditLog } from './entities/company_credit_log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Catalog, Company, CompanyCreditLog]),
    forwardRef(() => CatalogModule),
  ],
  controllers: [],
  providers: [CompanyService],
  exports: [CompanyService],
})
export class CompanyModule {}
