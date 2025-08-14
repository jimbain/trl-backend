import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { StorageService } from 'src/storage/storage.service';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { AdminCreatePharmaDto } from '../dto/pharma/admin-create-pharma.dto';
import { AdminUpdatePharmaDto } from '../dto/pharma/admin-update-pharma.dto';
import {
  AdminPharmaDto,
  AdminPharmaListDto,
} from '../dto/pharma/admin-pharma.dto';
import { plainToInstance } from 'class-transformer';
import { PaginationMeta } from 'src/common/interfaces';
import { Readable } from 'stream';
import { paginate } from 'src/common/helpers/pagination.helper';
import { PharmaService } from 'src/pharma/pharma.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { MEDIA } from 'src/constants';
import {
  QueryAdminPharmaDto,
  SearchFor,
} from '../dto/pharma/query-admin-pharma.dto';

@Injectable()
export class AdminPharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    private readonly pharmaService: PharmaService,
    private readonly storageService: StorageService,
    private readonly catalogService: CatalogService,
  ) {}

  async findAll(query: QueryAdminPharmaDto = {}): Promise<
    | {
        data: AdminPharmaDto[];
        meta: PaginationMeta;
      }
    | StreamableFile
  > {
    const {
      page,
      per_page,
      category_ids,
      is_active,
      is_featured,
      search_text,
      search_for,
      is_searching_whole_word,
      order_by_column,
      order_by,
      is_export,
    } = query;

    const queryBuilder = this.pharmaRepository
      .createQueryBuilder('pharma')
      .select([
        'pharma.id AS id',
        'pharma.sku AS sku',
        'pharma.title AS title',
        'pharma.is_active AS is_active',
        'pharma.is_featured AS is_featured',
      ]);

    // Apply filters
    const filters: Array<[any, string, Record<string, any>]> = [
      [is_active, 'pharma.is_active = :is_active', { is_active }],
      [is_featured, 'pharma.is_featured = :is_featured', { is_featured }],
    ];

    for (const [condition, clause, params] of filters) {
      if (condition !== undefined) {
        queryBuilder.andWhere(clause, params);
      }
    }

    // Category filtering
    if (category_ids && category_ids.length > 0) {
      const categoryConditions = category_ids.map(
        (_, index) => `pharma.categories @> :categoryId${index}`,
      );
      const categoryParams = category_ids.reduce(
        (params, categoryId, index) => ({
          ...params,
          [`categoryId${index}`]: JSON.stringify([categoryId]),
        }),
        {},
      );

      queryBuilder.andWhere(
        `(${categoryConditions.join(' OR ')})`,
        categoryParams,
      );
    }

    // Search functionality
    if (search_text && search_for) {
      const searchFields = ['pharma.title', 'pharma.description', 'pharma.sku'];

      // Sanitize search text
      const sanitizedSearchText = search_text.trim();
      const words = sanitizedSearchText
        .split(/\s+/)
        .filter((word) => word.length > 0);

      if (words.length > 0 || search_for === SearchFor.PHRASE) {
        if (search_for === SearchFor.PHRASE) {
          // Treat search_text as a single phrase
          const searchPattern = `%${sanitizedSearchText}%`;
          const conditions = searchFields.map(
            (field) => `${field} ILIKE :searchPattern`,
          );
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
              const fieldConditions = searchFields.map(
                (field) =>
                  `${field} ${isWholeWord ? '~*' : 'ILIKE'} :${paramName}`,
              );
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
            const conditions = searchFields.map(
              (field) => `${field} ${isWholeWord ? '~*' : 'ILIKE'} :pattern`,
            );
            queryBuilder.andWhere(`(${conditions.join(' OR ')})`, { pattern });
          }
        }
      }
    }

    // Ordering
    if (order_by_column && order_by) {
      const orderByMap: Record<string, string> = {
        sku: 'pharma.sku',
        title: 'pharma.title',
        is_active: 'pharma.is_active',
        is_featured: 'pharma.is_featured',
        created_at: 'pharma.created_at',
      };

      const column = orderByMap[order_by_column];

      if (column) {
        queryBuilder.orderBy(column, order_by);
      }
    } else {
      // Default ordering
      queryBuilder.orderBy('pharma.created_at', 'DESC');
    }

    if (is_export) {
      const stream = await this.export(queryBuilder);
      return new StreamableFile(stream);
    }

    return paginate(queryBuilder, page, per_page, AdminPharmaListDto);
  }

  async export(queryBuilder: SelectQueryBuilder<any>): Promise<Readable> {
    const stream = new Readable({
      read() {}, // Manual push streaming
      highWaterMark: 1024 * 1024, // 1MB buffer to control backpressure
    });

    // Write CSV Header
    stream.push('SKU,Title,Active,Featured\n');

    const batchSize = 1000;
    let lastId: string | null = null;
    let hasMoreData = true;

    try {
      while (hasMoreData) {
        // Use cursor-based pagination instead of offset
        const qb = queryBuilder.clone(); // Clone to avoid modifying original query
        if (lastId) {
          qb.andWhere('pharma.id > :lastId', { lastId });
        }
        qb.orderBy('pharma.id', 'ASC').limit(batchSize);

        const items = await qb.getRawMany();

        if (items.length === 0) {
          hasMoreData = false;
          break;
        }

        // Stream CSV rows
        items.forEach((item) => {
          const row =
            [
              `"${item.sku ? item.sku.replace(/"/g, '""') : ''}"`,
              `"${item.title ? item.title.replace(/"/g, '""') : ''}"`,
              item.is_active ? 'Yes' : 'No',
              item.is_featured ? 'Yes' : 'No',
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

  async create(payload: AdminCreatePharmaDto): Promise<AdminPharmaDto> {
    // Get default pharma catalog to validate categories
    const pharmaCatalog = await this.catalogService.findDefaultByType(
      MEDIA.PHARMA,
    );

    // Validate that all provided categories exist in the default pharma catalog
    const validCategories = pharmaCatalog.categories || [];
    const invalidCategories = payload.categories.filter(
      (categoryId) => !validCategories.includes(categoryId),
    );

    if (invalidCategories.length > 0) {
      throw new NotFoundException(
        `Invalid category IDs: ${invalidCategories.join(', ')}. Only default pharma categories are allowed.`,
      );
    }

    // Strip bucket URL to store only the path in database
    if (payload.image_url) {
      payload.image_url = this.storageService.stripBucketUrl(payload.image_url);
    }

    if (payload.video_url) {
      payload.video_url = this.storageService.stripBucketUrl(payload.video_url);
    }

    const pharma = this.pharmaRepository.create(payload);
    await this.pharmaRepository.save(pharma);

    const transformedPharma = await this.pharmaService.getTransformed(pharma);

    return plainToInstance(AdminPharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }

  async findOne(id: string): Promise<AdminPharmaDto> {
    const pharma = await this.pharmaService.findById(id);
    const transformedPharma = await this.pharmaService.getTransformed(pharma);

    return plainToInstance(AdminPharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: string,
    updatePharmaDto: AdminUpdatePharmaDto,
  ): Promise<AdminPharmaDto> {
    const pharma = await this.pharmaService.findById(id);

    // If categories are being updated, validate them
    if (updatePharmaDto.categories && updatePharmaDto.categories.length > 0) {
      const pharmaCatalog = await this.catalogService.findDefaultByType(
        MEDIA.PHARMA,
      );
      const validCategories = pharmaCatalog.categories || [];
      const invalidCategories = updatePharmaDto.categories.filter(
        (categoryId) => !validCategories.includes(categoryId),
      );

      if (invalidCategories.length > 0) {
        throw new NotFoundException(
          `Invalid category IDs: ${invalidCategories.join(', ')}. Only default pharma categories are allowed.`,
        );
      }
    }

    const updated = this.pharmaRepository.merge(pharma, updatePharmaDto);

    // Strip bucket URL to store only the path in database
    if (updated.image_url) {
      updated.image_url = this.storageService.stripBucketUrl(updated.image_url);
    }

    if (updated.video_url) {
      updated.video_url = this.storageService.stripBucketUrl(updated.video_url);
    }

    await this.pharmaRepository.save(updated);
    const transformedPharma = await this.pharmaService.getTransformed(updated);

    return plainToInstance(AdminPharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }

  async remove(id: string): Promise<void> {
    const pharma = await this.findOne(id);
    // await this.pharmaRepository.remove(pharma);
  }
}
