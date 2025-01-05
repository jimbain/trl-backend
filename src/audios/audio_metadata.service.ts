import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AudioMetadata } from './entities/audio_metadata.entity';
import { Repository } from 'typeorm';
import { CreateAudioMetadataDto } from './dto/create-audio-metadata.dto';
import { UpdateAudioMetadataDto } from './dto/update-audio-metadata.dto';

@Injectable()
export class AudioMetadataService {

  @InjectRepository(AudioMetadata)
  private readonly audioMetadataRepository: Repository<AudioMetadata>;

  async create(audioMetadataDto: CreateAudioMetadataDto) {
    const audioMetadata = this.audioMetadataRepository.create(audioMetadataDto);
    return await this.audioMetadataRepository.save(audioMetadata);
  }

  findAll() {
    return `This action returns all categories`;
  }

  async findOne(sku: string, relations: string[] = []) {
    const audioMetadata = await this.audioMetadataRepository.findOne({
      where: { sku },
      relations: relations.length ? relations : undefined,
    });

    return audioMetadata;
  }

  async update(sku: string, audioMetadataDto: UpdateAudioMetadataDto) {
    const audioMetadata = await this.findOne(sku);

    if (!audioMetadata) {
      throw new NotFoundException(`Audio metadata with SKU ${sku} not found`);
    }

    Object.assign(audioMetadata, audioMetadataDto);

    return await this.audioMetadataRepository.save(audioMetadata);
  }

  remove(id: number) {
    return `This action removes a #${id} category`;
  }

  getPopularity(id: string) {
    return Math.floor(Math.random() * (200 - 50 + 1)) + 50;
  }
}
