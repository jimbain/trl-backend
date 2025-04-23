import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { AdminAudioDto, AdminAudioListDto } from '../dto/audio/admin-audio.dto';
import { AppConfigService } from 'src/app-config/app-config.service';
import { plainToInstance } from 'class-transformer';
import { AdminUpdateAudioDto } from '../dto/audio/admin-update-audio.dto';
import { CacheService } from 'src/common/services/cache.service';
import { QueryAdminAudioDto } from '../dto/audio/query-admin-audio.dto';
import { paginate } from 'src/common/helpers/pagination.helper';

@Injectable()
export class AdminAudioService {
  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async findAll(query: QueryAdminAudioDto = {}) {
    const {
      page,
      per_page,
      category_id,
      is_included_in_category,
      is_active,
      search_text,
      search_for,
      is_searching_whole_word,
      street_date_from,
      street_date_to,
      bookshelf_credit_cost,
      retail_price_min,
      retail_price_max,
      retail_content_cost_min,
      retail_content_cost_max,
      is_featured,
      is_excluded,
      order_by_column,
      order_by,
    } = query;

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
      .select([
        'audio.id AS id',
        'audio.sku AS sku',
        'audio.display_title AS title',
        'audio.display_authors AS authors',
        'metadata.publisher AS publisher',
        'audio.is_excluded AS is_excluded',
        'audio.is_featured AS is_featured',
        'audio.is_active AS is_active',
        'metadata.street_date AS street_date',
        'metadata.findaway_retail_price AS retail_price',
        'metadata.findaway_retail_content_cost AS retail_content_cost',
        'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
        'metadata.language AS language',
        'metadata.bisac_codes AS bisac_codes',
        'metadata.runtime AS runtime',
        'audio.display_copyright AS copyright',
      ]);

    if (is_active !== undefined) {
      queryBuilder.andWhere('audio.is_active = :is_active', { is_active });
    }

    if (is_featured !== undefined) {
      queryBuilder.andWhere('audio.is_featured = :is_featured', {
        is_featured,
      });
    }

    if (is_excluded !== undefined) {
      queryBuilder.andWhere('audio.is_excluded = :is_excluded', {
        is_excluded,
      });
    }

    if (bookshelf_credit_cost !== undefined) {
      queryBuilder.andWhere(
        'audio.bookshelf_credit_cost = :bookshelf_credit_cost',
        { bookshelf_credit_cost },
      );
    }

    if (street_date_from) {
      queryBuilder.andWhere('DATE(metadata.street_date) >= :street_date_from', {
        street_date_from,
      });
    }

    if (street_date_to) {
      queryBuilder.andWhere('DATE(metadata.street_date) <= :street_date_to', {
        street_date_to,
      });
    }

    if (retail_price_min !== undefined) {
      queryBuilder.andWhere(
        'metadata.findaway_retail_price >= :retail_price_min',
        { retail_price_min },
      );
    }

    if (retail_price_max !== undefined) {
      queryBuilder.andWhere(
        'metadata.findaway_retail_price <= :retail_price_max',
        { retail_price_max },
      );
    }

    if (retail_content_cost_min !== undefined) {
      queryBuilder.andWhere(
        'metadata.findaway_retail_content_cost >= :retail_content_cost_min',
        { retail_content_cost_min },
      );
    }

    if (retail_content_cost_max !== undefined) {
      queryBuilder.andWhere(
        'metadata.findaway_retail_content_cost <= :retail_content_cost_max',
        { retail_content_cost_max },
      );
    }

    if (category_id) {
      queryBuilder.andWhere(
        is_included_in_category
          ? 'audio.categories @> :categoryId'
          : 'NOT audio.categories @> :categoryId',
        { categoryId: JSON.stringify([category_id]) },
      );
    }

    if (order_by_column && order_by) {
      queryBuilder.orderBy('order_by_column', order_by);
    }

    return paginate(queryBuilder, page, query.per_page);
  }

  async findOne(id: string) {
    const audio = await this.audioRepository.findOne({
      where: { id: id },
      relations: ['metadata'],
    });

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${id} not found`);
    }

    return plainToInstance(AdminAudioDto, audio, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, payload: AdminUpdateAudioDto) {
    const audio = await this.audioRepository.findOne({
      where: { id: id },
    });

    Object.assign(audio, payload);

    await Promise.all([
      this.cacheService.delete(id),
      this.audioRepository.save(audio),
    ]);
  }
}
