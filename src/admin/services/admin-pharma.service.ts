import { Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { StorageService } from 'src/storage/storage.service';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { AdminCreatePharmaDto } from '../dto/pharma/admin-create-pharma.dto';
import { AdminUpdatePharmaDto } from '../dto/pharma/admin-update-pharma.dto';
import { AdminPharmaDto } from '../dto/pharma/admin-pharma.dto';
import { plainToInstance } from 'class-transformer';
import { PaginationMeta } from 'src/common/interfaces';
import { Readable } from 'stream';
import { paginate } from 'src/common/helpers/pagination.helper';
import { PharmaService } from 'src/pharma/pharma.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { MEDIA } from 'src/constants';

@Injectable()
export class AdminPharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    private readonly pharmaService: PharmaService,
    private readonly storageService: StorageService,
    private readonly catalogService: CatalogService,
  ) {}

  async findAll(query: any = {}): Promise<
    | {
        data: AdminPharmaDto[];
        meta: PaginationMeta;
      }
    | StreamableFile
  > {
    const { page, per_page, is_export } = query;

    const queryBuilder = this.pharmaRepository
      .createQueryBuilder('pharma')
      .orderBy('created_at', 'DESC');

    if (is_export) {
      const stream = await this.export(queryBuilder);
      return new StreamableFile(stream);
    }

    const paginatedData = await paginate(
      queryBuilder,
      page,
      per_page,
      AdminPharmaDto,
    );

    paginatedData.data = await Promise.all(
      paginatedData.data.map(async (item) => ({
        ...item,
        image_url: item.image_url
          ? await this.storageService.generateSignedViewUrl(item.image_url)
          : null,
        video_url: item.video_url
          ? await this.storageService.generateSignedViewUrl(item.video_url)
          : null,
      })),
    );

    return paginatedData;
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
