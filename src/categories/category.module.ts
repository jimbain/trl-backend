import { Module, forwardRef } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CategoryController } from './category.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from './entities/category.entity';
import { CatalogModule } from 'src/catalog/catalog.module';
import { AudioModule } from 'src/audios/audio.module';
import { Audio } from 'src/audios/entities/audio.entity';
import { CommonModule } from 'src/common/common.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Category, Audio]),
    forwardRef(() => CatalogModule),
    forwardRef(() => AudioModule),
    forwardRef(() => CommonModule),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
