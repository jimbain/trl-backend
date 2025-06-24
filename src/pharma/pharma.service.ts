import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pharma } from './entities/pharma.entity';
import { StorageService } from 'src/storage/storage.service';

@Injectable()
export class PharmaService {
  // constructor(
  //   @InjectRepository(Pharma)
  //   private readonly pharmaRepository: Repository<Pharma>,
  //   private readonly storageService: StorageService,
  // ) {}
  // async findAll(): Promise<Pharma[]> {
  //   return await this.pharmaRepository.find({
  //     order: { created_at: 'DESC' },
  //   });
  // }
  // async create(payload: CreatePharmaDto): Promise<Pharma> {
  //   if (payload.image_url) {
  //     payload.image_url = this.storageService.stripBucketUrl(
  //       payload.image_url,
  //     );
  //   }
  //   if (payload.video_url) {
  //     payload.video_url = this.storageService.stripBucketUrl(
  //       payload.video_url,
  //     );
  //   }
  //   const pharma = this.pharmaRepository.create(payload);
  //   return await this.pharmaRepository.save(pharma);
  // }
  // async findOne(id: string): Promise<Pharma> {
  //   const pharma = await this.pharmaRepository.findOne({ where: { id } });
  //   if (!pharma) {
  //     throw new NotFoundException(`Pharma with id "${id}" not found`);
  //   }
  //   return pharma;
  // }
  // async update(id: string, updatePharmaDto: UpdatePharmaDto): Promise<Pharma> {
  //   const pharma = await this.findOne(id);
  //   const updated = this.pharmaRepository.merge(pharma, updatePharmaDto);
  //   if (updated.image_url) {
  //     updated.image_url = this.storageService.stripBucketUrl(
  //       updated.image_url,
  //     );
  //   }
  //   if (updated.video_url) {
  //     updated.video_url = this.storageService.stripBucketUrl(
  //       updated.video_url,
  //     );
  //   }
  //   return await this.pharmaRepository.save(updated);
  // }
  // async remove(id: string): Promise<void> {
  //   const pharma = await this.findOne(id);
  //   await this.pharmaRepository.remove(pharma);
  // }
}
