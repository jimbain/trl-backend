import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CategoryModule } from 'src/categories/category.module';
import { CatalogService } from './catalog.service';
import { Audio } from 'src/audios/entities/audio.entity';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { Video } from 'src/video/entities/video.entity';
import { AppElasticsearchModule } from 'src/app-elasticsearch/app-elasticsearch.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Catalog, Audio, Pharma, Video]),
    forwardRef(() => CategoryModule),
    forwardRef(() => AppElasticsearchModule),
  ],
  controllers: [],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
