import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CategoryModule } from 'src/categories/category.module';
import { CatalogService } from './catalog.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Catalog]),
    forwardRef(() => CategoryModule),
  ],
  controllers: [],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
