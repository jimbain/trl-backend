import { Module, forwardRef } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { CatalogModule } from 'src/catalog/catalog.module';
import { AudioModule } from 'src/audios/audio.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category]),
    forwardRef(() => CatalogModule),
    forwardRef(() => AudioModule),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
