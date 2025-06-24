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

@Injectable()
export class AdminPharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    private readonly pharmaService: PharmaService,
    private readonly storageService: StorageService,
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
    const updated = this.pharmaRepository.merge(pharma, updatePharmaDto);

    if (updated.image_url) {
      updated.image_url = this.storageService.stripBucketUrl(updated.image_url);
    }

    if (updated.video_url) {
      updated.video_url = this.storageService.stripBucketUrl(updated.video_url);
    }

    await this.pharmaRepository.save(updated);
    const transformedPharma = await this.pharmaService.getTransformed(pharma);

    return plainToInstance(AdminPharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }

  async remove(id: string): Promise<void> {
    const pharma = await this.findOne(id);
    // await this.pharmaRepository.remove(pharma);
  }
}
