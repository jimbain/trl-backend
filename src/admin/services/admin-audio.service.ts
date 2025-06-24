import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
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
import { AdminBulkUpdateAudioDto } from '../dto/audio/admin-bulk-update-audio.dto';
import { Readable } from 'stream';
import { AudioElasticsearchSyncService } from 'src/audios/audio-elasticsearch-sync.service';

@Injectable()
export class AdminAudioService {
  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  constructor(
    private readonly audioElasticsearchSyncService: AudioElasticsearchSyncService,
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
      is_export,
    } = query;

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
      .leftJoin('audio.primaryCategory', 'primaryCategory')
      .select([
        'audio.id AS id',
        'audio.sku AS sku',
        'audio.display_title AS title',
        'audio.display_authors AS authors',
        'metadata.publisher AS publisher',
        'audio.is_excluded AS is_excluded',
        'audio.is_featured AS is_featured',
        'audio.is_active AS is_active',
        'primaryCategory.name AS first_category_name',
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

    // Category inclusion/exclusion
    if (category_id) {
      const clause = is_included_in_category
        ? 'audio.categories @> :categoryId'
        : 'NOT audio.categories @> :categoryId';

      queryBuilder.andWhere(clause, {
        categoryId: JSON.stringify([category_id]),
      });
    }

    // Search functionality
    if (search_text && search_for) {
      const searchFields = [
        'audio.display_title',
        'audio.display_description',
        'metadata.publisher',
      ];

      // Unified JSONB array search handler
      const jsonbSearchCondition = (
        column: string,
        alias: string,
        paramName: string,
        useRegex: boolean,
      ) => {
        return `EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(${column}) AS ${alias}
          WHERE ${alias} ${useRegex ? '~*' : 'ILIKE'} :${paramName}
        )`;
      };

      // Sanitize search text
      const sanitizedSearchText = search_text.trim();
      const words = sanitizedSearchText
        .split(/\s+/)
        .filter((word) => word.length > 0);

      if (words.length > 0 || search_for === SearchFor.PHRASE) {
        if (search_for === SearchFor.PHRASE) {
          // Treat search_text as a single phrase
          const searchPattern = `%${sanitizedSearchText}%`;
          const conditions = [
            ...searchFields.map((field) => `${field} ILIKE :searchPattern`),
            jsonbSearchCondition(
              'audio.display_authors',
              'author',
              'searchPattern',
              false,
            ),
            jsonbSearchCondition(
              'metadata.bisac_codes',
              'bisac',
              'searchPattern',
              false,
            ),
          ];
          queryBuilder.andWhere(`(${conditions.join(' OR ')})`, {
            searchPattern,
          });
        } else {
          const isWholeWord = is_searching_whole_word;
          if (search_for === SearchFor.ALL_WORDS) {
            // Match all words
            const conditions = words.map((word, index) => {
              const paramName = `pattern${index}`;
              const pattern = isWholeWord ? `\\m${word}\\M` : `${word}%`;
              const fieldConditions = [
                ...searchFields.map(
                  (field) =>
                    `${field} ${isWholeWord ? '~*' : 'ILIKE'} :${paramName}`,
                ),
                jsonbSearchCondition(
                  'audio.display_authors',
                  'author',
                  paramName,
                  isWholeWord,
                ),
                jsonbSearchCondition(
                  'metadata.bisac_codes',
                  'bisac',
                  paramName,
                  isWholeWord,
                ),
              ];
              return `(${fieldConditions.join(' OR ')})`;
            });
            queryBuilder.andWhere(
              `(${conditions.join(' AND ')})`,
              words.reduce(
                (params, word, index) => ({
                  ...params,
                  [`pattern${index}`]: isWholeWord
                    ? `\\m${word}\\M`
                    : `${word}%`,
                }),
                {},
              ),
            );
          } else if (search_for === SearchFor.ANY_WORD) {
            // Match any word
            const pattern = isWholeWord
              ? words.map((word) => `\\m${word}\\M`).join('|')
              : words.map((word) => `${word}%`).join('|');
            const conditions = [
              ...searchFields.map(
                (field) => `${field} ${isWholeWord ? '~*' : 'ILIKE'} :pattern`,
              ),
              jsonbSearchCondition(
                'audio.display_authors',
                'author',
                'pattern',
                isWholeWord,
              ),
              jsonbSearchCondition(
                'metadata.bisac_codes',
                'bisac',
                'pattern',
                isWholeWord,
              ),
            ];
            queryBuilder.andWhere(`(${conditions.join(' OR ')})`, { pattern });
          }
        }
      }
    }

    // Ordering
    if (order_by_column && order_by) {
      const orderByMap: Record<string, string> = {
        sku: 'audio.sku',
        title: 'audio.display_title',
        author: 'audio.display_authors->>0',
        category: 'primaryCategory.name',
        publisher: 'metadata.publisher',
        street_date: 'metadata.street_date',
        activated_at: 'audio.activated_at',
        curated_at: 'audio.curated_at',
        fa_retail_price: 'metadata.findaway_retail_price',
        fa_retail_content_cost: 'metadata.findaway_retail_content_cost',
        bookshelf_credit_cost: 'audio.bookshelf_credit_cost',
        language: 'metadata.language',
        bisac_code: 'metadata.bisac_codes->>0',
        runtime: 'metadata.runtime',
        copyright: 'audio.display_copyright',
        is_active: 'audio.is_active',
        is_excluded: 'audio.is_excluded',
        is_featured: 'audio.is_featured',
      };

      const column = orderByMap[order_by_column];

      if (column) {
        queryBuilder.orderBy(column, order_by);
      }
    }

    if (is_export) {
      const stream = await this.export(queryBuilder);
      return new StreamableFile(stream);
    }

    return paginate(queryBuilder, page, per_page);
  }

  async export(queryBuilder: SelectQueryBuilder<any>): Promise<Readable> {
    const stream = new Readable({
      read() {}, // Manual push streaming
      highWaterMark: 1024 * 1024, // 1MB buffer to control backpressure
    });

    // Write CSV Header
    stream.push(
      'Title,Authors,Category,Publisher,Excluded,New FA,FA Retail Price,FA Content Cost,New TRL,TRL Cost,Curated At,Featured,Active,Language,BISAC,Length,Copyright\n',
    );

    const batchSize = 1000;
    let lastId: string | null = null;
    let hasMoreData = true;

    try {
      while (hasMoreData) {
        // Use cursor-based pagination instead of offset
        const qb = queryBuilder.clone(); // Clone to avoid modifying original query
        if (lastId) {
          qb.andWhere('audio.id > :lastId', { lastId });
        }
        qb.orderBy('audio.id', 'ASC').limit(batchSize);

        const items = await qb.getRawMany();

        if (items.length === 0) {
          hasMoreData = false;
          break;
        }

        // Stream CSV rows
        items.forEach((item) => {
          const row =
            [
              `"${item.title.replace(/"/g, '""')}"`,
              `"${item.authors ? item.authors.join(', ').replace(/"/g, '""') : ''}"`,
              `"${item.first_category_name ?? ''}"`,
              `"${item.publisher ? item.publisher.replace(/"/g, '""') : ''}"`,
              item.is_excluded ? '1' : '0',
              `"${item.street_date ?? ''}"`,
              `"${item.fa_retail_price ? `$${item.fa_retail_price}` : ''}"`,
              `"${item.fa_retail_content_cost ? `$${item.fa_retail_content_cost}` : ''}"`,
              `"${item.activated_at ?? ''}"`,
              `"${item.bookshelf_credit_cost ?? ''}"`,
              `"${item.curated_at ?? ''}"`,
              item.is_featured ? '1' : '0',
              item.is_active ? '1' : '0',
              `"${item.language ? item.language.replace(/"/g, '""') : ''}"`,
              `"${item.bisac_codes ? item.bisac_codes.join(', ').replace(/"/g, '""') : ''}"`,
              `"${item.runtime ?? ''}"`,
              `"${item.copyright ? item.copyright.replace(/"/g, '""') : ''}"`,
            ].join(',') + '\n';

          // Check for backpressure
          if (!stream.push(row)) {
            // Pause if stream is full
            return new Promise((resolve) => stream.once('drain', resolve));
          }
        });

        lastId = items[items.length - 1].id;
      }

      // End the stream
      stream.push(null);
    } catch (error) {
      stream.emit('error', error);
      stream.push(null);
    }

    return stream;
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

    const justActivated =
      !audio.is_active && payload.is_active && !audio.activated_at;
    const justCurated =
      audio.bookshelf_credit_cost === 0 &&
      payload.bookshelf_credit_cost > 0 &&
      !audio.curated_at;

    Object.assign(audio, payload, {
      activated_at: justActivated ? new Date() : audio.activated_at,
      curated_at: justCurated ? new Date() : audio.curated_at,
    });

    await Promise.all([
      this.cacheService.delete(id),
      this.audioRepository.save(audio),
    ]);

    await this.audioElasticsearchSyncService.syncAudioById(id);
  }

  async bulkUpdate(payload: AdminBulkUpdateAudioDto) {
    const updates = payload.updates;

    const ids = updates.map((u) => u.id);
    const audioEntities = await this.audioRepository.findBy({ id: In(ids) });

    // Ensure all provided IDs exist
    if (audioEntities.length !== updates.length) {
      const foundIds = new Set(audioEntities.map((a) => a.id));
      const missingIds = ids.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Audio IDs not found: ${missingIds.join(', ')}`,
      );
    }

    // Map updates by ID for quick access
    const updatesMap = new Map(updates.map((u) => [u.id, u]));

    // Apply updates in memory
    const updatedAudios = audioEntities.map((audio) => {
      const update = updatesMap.get(audio.id);
      if (update.is_active !== undefined) {
        audio.is_active = update.is_active;
      }
      if (update.is_excluded !== undefined) {
        audio.is_excluded = update.is_excluded;
      }
      if (update.is_featured !== undefined) {
        audio.is_featured = update.is_featured;
      }
      return audio;
    });

    await this.audioRepository.save(updatedAudios);

    await Promise.all(
      ids.map((id) => this.audioElasticsearchSyncService.syncAudioById(id)),
    );
  }
}
