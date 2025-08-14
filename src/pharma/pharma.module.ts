import { forwardRef, Module } from '@nestjs/common';
import { PharmaService } from './pharma.service';
import { PharmaController } from './pharma.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pharma } from './entities/pharma.entity';
import { StorageModule } from 'src/storage/storage.module';
import { CompanyModule } from 'src/companies/company.module';
import { CatalogModule } from 'src/catalog/catalog.module';
import { CategoryModule } from 'src/categories/category.module';
import { AppConfigModule } from 'src/app-config/app-config.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Pharma]),
    forwardRef(() => AppConfigModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => CatalogModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => StorageModule),
  ],
  controllers: [PharmaController],
  providers: [PharmaService],
  exports: [PharmaService],
})
export class PharmaModule {}
