import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CATALOG_CATEGORY_TYPE, MEDIA } from 'src/constants';
import { Category } from 'src/categories/entities/category.entity';

@Injectable()
export class CatalogSeeder {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,

    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
  ) {}

  async seed() {
    console.log(
      '###########################  CATALOG SEEDING START  ###########################',
    );

    const categories = await this.categoryRepository.find({
      where: {
        is_active: true,
      },
      select: ['id'],
    });

    const catalogs = [
      {
        name: 'TRL Audio',
        type: CATALOG_CATEGORY_TYPE.DEFAULT,
        media_type: MEDIA.AUDIO,
        categories: categories.map((category) => category?.id) ?? [],
      },
      {
        name: 'TRL Video',
        type: CATALOG_CATEGORY_TYPE.DEFAULT,
        media_type: MEDIA.VIDEO,
      },
      {
        name: 'TRL Pharma',
        type: CATALOG_CATEGORY_TYPE.DEFAULT,
        media_type: MEDIA.PHARMA,
      },
    ];

    for (const catalog of catalogs) {
      const catalogEntity = this.catalogRepository.create(catalog);
      await this.catalogRepository.save(catalogEntity);
    }

    console.log(
      '###########################  CATALOG SEEDING END  ###########################',
    );
  }
}
