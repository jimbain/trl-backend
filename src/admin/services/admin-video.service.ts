import {
  Injectable,
  NotFoundException,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { StorageService } from 'src/storage/storage.service';
import { Video } from 'src/video/entities/video.entity';
import { AdminCreateVideoDto } from '../dto/video/admin-create-video.dto';
import { AdminUpdateVideoDto } from '../dto/video/admin-update-video.dto';
import { AdminVideoDto, AdminVideoListDto } from '../dto/video/admin-video.dto';
import { plainToInstance } from 'class-transformer';
import { PaginationMeta } from 'src/common/interfaces';
import { Readable } from 'stream';
import { paginate } from 'src/common/helpers/pagination.helper';
import { VideoService } from 'src/video/services/video.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { MEDIA } from 'src/constants';
import {
  QueryAdminVideoDto,
  SearchFor,
} from '../dto/video/query-admin-video.dto';
import { AdminBulkUpdateVideoDto } from '../dto/video/admin-bulk-update-video.dto';

@Injectable()
export class AdminVideoService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,

    private readonly videoService: VideoService,
    private readonly storageService: StorageService,
    private readonly catalogService: CatalogService,
  ) {}

  async findAll(query: QueryAdminVideoDto = {}): Promise<
    | {
        data: AdminVideoListDto[];
        meta: PaginationMeta;
      }
    | StreamableFile
  > {
    const {
      page,
      per_page,
      category_id,
      is_included_in_category,
      category_ids,
      is_active,
      is_featured,
      search_text,
      search_for,
      is_searching_whole_word,
      order_by_column,
      order_by,
      is_export,
      avilar_course_id,
      group,
    } = query;

    const queryBuilder = this.videoRepository
      .createQueryBuilder('video')
      .leftJoin(
        'categories',
        'category',
        `category.id IN (
            SELECT jsonb_array_elements_text(video.categories)
          )
          AND category.type = 'default'`,
      )
      .groupBy('video.id')
      .select([
        'video.id AS id',
        'video.sku AS sku',
        'video.title AS title',
        'MIN(category.name) AS category',
        'video.is_active AS is_active',
        'video.is_featured AS is_featured',
        'video.avilar_course_id AS avilar_course_id',
        'video.group AS group',
      ]);

    // Apply filters
    const filters: Array<[any, string, Record<string, any>]> = [
      [is_active, 'video.is_active = :is_active', { is_active }],
      [is_featured, 'video.is_featured = :is_featured', { is_featured }],
      [
        avilar_course_id,
        'video.avilar_course_id = :avilar_course_id',
        { avilar_course_id },
      ],
      [group, 'video.group = :group', { group }],
    ];

    for (const [condition, clause, params] of filters) {
      if (condition !== undefined) {
        queryBuilder.andWhere(clause, params);
      }
    }

    // Category filtering
    if (category_ids && category_ids.length > 0) {
      const categoryConditions = category_ids.map(
        (_, index) => `video.categories @> :categoryId${index}`,
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

    if (category_id) {
      if (is_included_in_category) {
        queryBuilder.andWhere('video.categories @> :categories', {
          categories: JSON.stringify([category_id]),
        });
      } else {
        queryBuilder.andWhere('NOT (video.categories @> :categories)', {
          categories: JSON.stringify([category_id]),
        });
      }
    }

    // Search functionality
    if (search_text) {
      this.applySearchFilter(
        queryBuilder,
        search_text,
        search_for,
        is_searching_whole_word,
      );
    }

    // Sorting
    if (order_by_column) {
      queryBuilder.orderBy(`video.${order_by_column}`, order_by || 'ASC');
    } else {
      queryBuilder.orderBy('video.created_at', 'DESC');
    }

    if (is_export) {
      return this.exportToCsv(queryBuilder);
    }

    const { data, meta } = await paginate(queryBuilder, page, per_page);

    return {
      data: plainToInstance(AdminVideoListDto, data, {
        excludeExtraneousValues: true,
      }),
      meta,
    };
  }

  private applySearchFilter(
    queryBuilder: SelectQueryBuilder<Video>,
    searchText: string,
    searchFor: SearchFor = SearchFor.PHRASE,
    isWholeWord: boolean = false,
  ): void {
    const searchPattern = isWholeWord ? `\\b${searchText}\\b` : searchText;

    switch (searchFor) {
      case SearchFor.PHRASE:
        queryBuilder.andWhere(
          '(video.title ~* :searchPattern OR video.description ~* :searchPattern OR video.sku ~* :searchPattern)',
          { searchPattern },
        );
        break;

      case SearchFor.ALL_WORDS:
        const allWordsPattern = searchText
          .split(/\s+/)
          .map((word) => (isWholeWord ? `\\b${word}\\b` : word))
          .map((word) => `(?=.*${word})`)
          .join('');
        queryBuilder.andWhere(
          '(video.title ~* :allWordsPattern OR video.description ~* :allWordsPattern OR video.sku ~* :allWordsPattern)',
          { allWordsPattern },
        );
        break;

      case SearchFor.ANY_WORD:
        const anyWordPattern = searchText
          .split(/\s+/)
          .map((word) => (isWholeWord ? `\\b${word}\\b` : word))
          .join('|');
        queryBuilder.andWhere(
          '(video.title ~* :anyWordPattern OR video.description ~* :anyWordPattern OR video.sku ~* :anyWordPattern)',
          { anyWordPattern },
        );
        break;
    }
  }

  private async exportToCsv(
    queryBuilder: SelectQueryBuilder<Video>,
  ): Promise<StreamableFile> {
    const videos = await queryBuilder.getRawMany();

    const csvHeaders = [
      'ID',
      'SKU',
      'Group',
      'Title',
      'Is Active',
      'Is Featured',
      'Category',
    ];

    const csvRows = videos.map((video) => [
      video.id,
      video.sku || '',
      video.group || '',
      video.title,
      video.is_active ? 'Yes' : 'No',
      video.is_featured ? 'Yes' : 'No',
      Array.isArray(video.categories) ? video.categories.join(', ') : '',
    ]);

    const csvContent = [csvHeaders, ...csvRows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const stream = Readable.from([csvContent]);
    return new StreamableFile(stream);
  }

  async findOne(id: string): Promise<AdminVideoDto> {
    const video = await this.videoRepository.findOne({
      where: { id },
    });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    const transformedVideo = await this.videoService.getTransformed(video);

    return plainToInstance(AdminVideoDto, transformedVideo, {
      excludeExtraneousValues: true,
    });
  }

  async create(payload: AdminCreateVideoDto): Promise<AdminVideoDto> {
    // Get default video catalog to validate categories
    const videoCatalog = await this.catalogService.findDefaultByType(
      MEDIA.VIDEO,
    );

    // Validate that all provided categories exist in the default pharma catalog
    const validCategories = videoCatalog.categories || [];
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

    const video = this.videoRepository.create(payload);
    await this.videoRepository.save(video);

    const transformedVideo = await this.videoService.getTransformed(video);

    return plainToInstance(AdminVideoDto, transformedVideo, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: string,
    updateVideoDto: AdminUpdateVideoDto,
  ): Promise<AdminVideoDto> {
    const video = await this.videoService.findById(id);

    if (updateVideoDto.sku && updateVideoDto.sku !== video.sku) {
      const existingVideo = await this.videoRepository.findOne({
        where: { sku: updateVideoDto.sku },
      });

      if (existingVideo && existingVideo.id !== id) {
        throw new NotFoundException(
          `SKU '${updateVideoDto.sku}' already exists. Please use a different SKU.`,
        );
      }
    }

    // If categories are being updated, validate them
    if (updateVideoDto.categories && updateVideoDto.categories.length > 0) {
      const videoCatalog = await this.catalogService.findDefaultByType(
        MEDIA.VIDEO,
      );
      const validCategories = videoCatalog.categories || [];
      const invalidCategories = updateVideoDto.categories.filter(
        (categoryId) => !validCategories.includes(categoryId),
      );

      if (invalidCategories.length > 0) {
        throw new NotFoundException(
          `Invalid category IDs: ${invalidCategories.join(', ')}. Only default pharma categories are allowed.`,
        );
      }
    }

    const updated = this.videoRepository.merge(video, updateVideoDto);

    // Strip bucket URL to store only the path in database
    if (updated.image_url) {
      updated.image_url = this.storageService.stripBucketUrl(updated.image_url);
    }

    await this.videoRepository.save(updated);
    const transformedVideo = await this.videoService.getTransformed(updated);

    return plainToInstance(AdminVideoDto, transformedVideo, {
      excludeExtraneousValues: true,
    });
  }

  async bulkUpdate(
    payload: AdminBulkUpdateVideoDto,
  ): Promise<{ message: string }> {
    const { updates } = payload;
    const videoIds = updates.map((update) => update.id);

    // Verify all videos exist
    const existingVideos = await this.videoRepository.find({
      where: { id: In(videoIds) },
      select: ['id'],
    });

    if (existingVideos.length !== videoIds.length) {
      throw new NotFoundException('One or more videos not found');
    }

    // Apply bulk updates
    for (const update of updates) {
      const { id, ...updateData } = update;
      await this.videoRepository.update({ id }, updateData);
    }

    return { message: 'Videos updated successfully' };
  }

  async remove(id: string): Promise<{ message: string }> {
    const video = await this.videoRepository.findOne({ where: { id } });

    if (!video) {
      throw new NotFoundException('Video not found');
    }

    await this.videoRepository.softDelete(id);

    return { message: 'Video deleted successfully' };
  }
}
