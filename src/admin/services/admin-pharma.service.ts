import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorageService } from 'src/storage/storage.service';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { AdminCreatePharmaDto } from '../dto/pharma/admin-create-pharma.dto';
import { AdminUpdatePharmaDto } from '../dto/pharma/admin-update-pharma.dto';
import { AdminPharmaDto } from '../dto/pharma/admin-pharma.dto';
import { plainToInstance } from 'class-transformer';

@Injectable()
export class AdminPharmaService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    private readonly storageService: StorageService,
  ) {}

  async findAll(query: any = {}): Promise<Pharma[]> {
    return await this.pharmaRepository.find({
      order: { created_at: 'DESC' },
    });
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

  async create(payload: AdminCreatePharmaDto): Promise<AdminPharmaDto> {
    if (payload.image_url) {
      payload.image_url = this.storageService.stripBucketUrl(payload.image_url);
    }

    if (payload.video_url) {
      payload.video_url = this.storageService.stripBucketUrl(payload.video_url);
    }

    const pharma = this.pharmaRepository.create(payload);
    await this.pharmaRepository.save(pharma);

    const transformedPharma = await this.getTransformed(pharma);

    return plainToInstance(AdminPharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }

  async findById(id: string): Promise<Pharma> {
    const pharma = await this.pharmaRepository.findOne({ where: { id } });
    if (!pharma) {
      throw new NotFoundException(`Pharma with id "${id}" not found`);
    }
    return pharma;
  }

  async findOne(id: string): Promise<AdminPharmaDto> {
    const pharma = await this.findById(id);
    const transformedPharma = await this.getTransformed(pharma);

    return plainToInstance(AdminPharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }

  async update(
    id: string,
    updatePharmaDto: AdminUpdatePharmaDto,
  ): Promise<AdminPharmaDto> {
    const pharma = await this.findById(id);
    const updated = this.pharmaRepository.merge(pharma, updatePharmaDto);

    if (updated.image_url) {
      updated.image_url = this.storageService.stripBucketUrl(updated.image_url);
    }

    if (updated.video_url) {
      updated.video_url = this.storageService.stripBucketUrl(updated.video_url);
    }

    await this.pharmaRepository.save(updated);
    const transformedPharma = await this.getTransformed(pharma);

    return plainToInstance(AdminPharmaDto, transformedPharma, {
      excludeExtraneousValues: true,
    });
  }

  async remove(id: string): Promise<void> {
    const pharma = await this.findOne(id);
    // await this.pharmaRepository.remove(pharma);
  }
}
