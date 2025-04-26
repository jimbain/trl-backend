import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { AdminAudioDto } from '../dto/audio/admin-audio.dto';
import { plainToInstance } from 'class-transformer';
import { AdminUpdateAudioDto } from '../dto/audio/admin-update-audio.dto';
import { CacheService } from 'src/common/services/cache.service';
import {
  QueryAdminAudioDto,
  SearchFor,
} from '../dto/audio/query-admin-audio.dto';
import { paginate } from 'src/common/helpers/pagination.helper';

@Injectable()
export class AdminAudioService {
  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  constructor(private readonly cacheService: CacheService) {}

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
      .leftJoin(
        'categories',
        'category',
        'category.id IN (SELECT jsonb_array_elements_text(audio.categories)) AND category.type = :categoryType',
        { categoryType: 'default' },
      )
      .groupBy('audio.id, metadata.sku')
      .select([
        'audio.id AS id',
        'audio.sku AS sku',
        'audio.display_title AS title',
        'audio.display_authors AS authors',
        'metadata.publisher AS publisher',
        'audio.is_excluded AS is_excluded',
        'audio.is_featured AS is_featured',
        'audio.is_active AS is_active',
        'array_agg(category.name) AS categories',
        'metadata.findaway_retail_price AS fa_retail_price',
        'metadata.findaway_retail_content_cost AS fa_retail_content_cost',
        'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
        'metadata.language AS language',
        'metadata.bisac_codes AS bisac_codes',
        'metadata.runtime AS runtime',
        'audio.display_copyright AS copyright',
        `TO_CHAR(metadata.street_date, 'MM-DD-YYYY') AS street_date`,
        `TO_CHAR(audio.activated_at, 'MM-DD-YYYY') AS activated_at`,
        `TO_CHAR(audio.curated_at, 'MM-DD-YYYY') AS curated_at`,
      ]);

    const filters: Array<[any, string, Record<string, any>]> = [
      [is_active, 'audio.is_active = :is_active', { is_active }],
      [is_featured, 'audio.is_featured = :is_featured', { is_featured }],
      [is_excluded, 'audio.is_excluded = :is_excluded', { is_excluded }],
      [
        bookshelf_credit_cost,
        'audio.bookshelf_credit_cost = :bookshelf_credit_cost',
        { bookshelf_credit_cost },
      ],
      [
        street_date_from,
        'DATE(metadata.street_date) >= :street_date_from',
        { street_date_from },
      ],
      [
        street_date_to,
        'DATE(metadata.street_date) <= :street_date_to',
        { street_date_to },
      ],
      [
        retail_price_min,
        'metadata.findaway_retail_price >= :retail_price_min',
        { retail_price_min },
      ],
      [
        retail_price_max,
        'metadata.findaway_retail_price <= :retail_price_max',
        { retail_price_max },
      ],
      [
        retail_content_cost_min,
        'metadata.findaway_retail_content_cost >= :retail_content_cost_min',
        { retail_content_cost_min },
      ],
      [
        retail_content_cost_max,
        'metadata.findaway_retail_content_cost <= :retail_content_cost_max',
        { retail_content_cost_max },
      ],
    ];

    for (const [condition, clause, params] of filters) {
      if (condition !== undefined) {
        queryBuilder.andWhere(clause, params);
      }
    }

    // Search Text logic
    if (search_text) {
      const searchConditions: string[] = [];
      const searchParams: Record<string, any> = {};

      const searchValue = is_searching_whole_word
        ? `% ${search_text} %`
        : `%${search_text}%`;

      if (search_for === SearchFor.PHRASE || !search_for) {
        // Search whole phrase
        searchConditions.push(
          'audio.display_title ILIKE :searchText',
          'audio.display_description ILIKE :searchText',
          'metadata.publisher ILIKE :searchText',
          `EXISTS (SELECT 1 FROM jsonb_array_elements_text(audio.display_authors) elem WHERE elem ILIKE :searchText)`,
          `EXISTS (SELECT 1 FROM jsonb_array_elements_text(metadata.bisac_codes) elem WHERE elem ILIKE :searchText)`,
        );
        searchParams.searchText = searchValue;
      } else if (
        search_for === SearchFor.ALL_WORDS ||
        search_for === SearchFor.ANY_WORD
      ) {
        // Split into words
        const words = search_text
          .split(' ')
          .filter((word) => word.trim().length > 0);

        const subConditions: string[] = [];

        words.forEach((word, idx) => {
          const paramKey = `searchWord${idx}`;
          const value = is_searching_whole_word ? `% ${word} %` : `%${word}%`;
          searchParams[paramKey] = value;

          subConditions.push(
            `(audio.display_title ILIKE :${paramKey} OR audio.display_description ILIKE :${paramKey} OR metadata.publisher ILIKE :${paramKey} OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(audio.display_authors) elem WHERE elem ILIKE :${paramKey}) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(metadata.bisac_codes) elem WHERE elem ILIKE :${paramKey}))`,
          );
        });

        if (search_for === SearchFor.ALL_WORDS) {
          // All words => AND
          searchConditions.push(...subConditions);
        } else {
          // Any word => OR
          searchConditions.push(`(${subConditions.join(' OR ')})`);
        }
      }

      if (searchConditions.length > 0) {
        queryBuilder.andWhere(
          `(${searchConditions.join(' OR ')})`,
          searchParams,
        );
      }
    }

    // Category inclusion/exclusion
    if (category_id) {
      const clause = is_included_in_category
        ? 'audio.categories @> :categoryId'
        : 'NOT audio.categories @> :categoryId';

      queryBuilder.andWhere(clause, {
        categoryId: JSON.stringify([category_id]),
      });
    }

    // Ordering
    if (order_by_column && order_by) {
      const orderByMap: Record<string, string> = {
        sku: 'audio.sku',
        title: 'audio.display_title',
        author: 'audio.display_authors->>0',
        publisher: 'metadata.publisher',
        street_date: 'metadata.street_date',
        fa_retail_price: 'metadata.findaway_retail_price',
        fa_retail_content_cost: 'metadata.findaway_retail_content_cost',
        bookshelf_credit_cost: 'audio.bookshelf_credit_cost',
        language: 'metadata.language',
        bisac_code: 'metadata.bisac_codes->>0',
        runtime: 'metadata.runtime',
        copyright: 'audio.display_copyright',
      };

      const column = orderByMap[order_by_column];

      if (column) {
        queryBuilder.orderBy(column, order_by);
      }
    }

    return paginate(queryBuilder, page, per_page);
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

    let justActivated: boolean = false;
    let justCurated: boolean = false;

    if (!audio.is_active && payload.is_active && !audio.activated_at) {
      justActivated = true;
    }

    if (
      audio.bookshelf_credit_cost === 0 &&
      payload.bookshelf_credit_cost !== 0 &&
      !audio.curated_at
    ) {
      justCurated = true;
    }

    Object.assign(audio, payload);

    audio.activated_at = justActivated ? new Date() : audio.activated_at;
    audio.curated_at = justCurated ? new Date() : audio.curated_at;

    await Promise.all([
      this.cacheService.delete(id),
      this.audioRepository.save(audio),
    ]);
  }
}
