import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pharma } from './entities/pharma.entity';
import { StorageService } from 'src/storage/storage.service';
import { PharmaDto, PharmaListDto } from './dto/pharma.dto';
import { PaginationMeta } from 'src/common/interfaces';
import { paginate } from 'src/common/helpers/pagination.helper';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class PharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,
    private readonly storageService: StorageService,
  ) {}
  async findAll(query: any = {}): Promise<{
    data: PharmaListDto[];
    meta: PaginationMeta;
  }> {
    const { page, per_page } = query;

    const queryBuilder = this.pharmaRepository
      .createQueryBuilder('pharma')
      .where('pharma.is_active = true')
      .orderBy('created_at', 'DESC');

    const paginatedData = await paginate(
      queryBuilder,
      page,
      per_page,
      PharmaListDto,
    );

    paginatedData.data = await Promise.all(
      paginatedData.data.map(async (item) => ({
        ...item,
        image_url: item.image_url
          ? await this.storageService.generateSignedViewUrl(item.image_url)
          : null,
      })),
    );

    return paginatedData;
  }

  async findById(id: string): Promise<Pharma> {
    const pharma = await this.pharmaRepository.findOne({ where: { id } });
    if (!pharma) {
      throw new NotFoundException(`Pharma with id "${id}" not found`);
    }
    return pharma;
  }

  async getTransformed(pharma: Pharma): Promise<Pharma> {
    if (pharma.image_url) {
      pharma.image_url = await this.storageService.generateSignedViewUrl(
        pharma.image_url,
      );
    }

    if (pharma.video_url) {
      pharma.video_url = await this.storageService.generateSignedViewUrl(
        pharma.video_url,
      );
    }

    return pharma;
  }

  async findOne(id: string): Promise<PharmaDto> {
    const pharma = await this.findById(id);
    const transformedPharma = await this.getTransformed(pharma);

    return plainToInstance(PharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }
}
