import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAudioDto } from './dto/create-audio.dto';
import { UpdateAudioDto } from './dto/update-audio.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { AudioCategory } from 'src/audio/entities/audio_category.entity';
import { Repository } from 'typeorm';
import { CompanyAudioCategory } from 'src/company/entities/company_audio_category.entity';
import { Audio } from './entities/audio.entity';

@Injectable()
export class AudioService {
  @InjectRepository(AudioCategory)
    private readonly audioCategoryRepository: Repository<AudioCategory>

  @InjectRepository(CompanyAudioCategory)
    private readonly companyAudioCategoryRepository: Repository<CompanyAudioCategory>

  @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>

  create(createAudioDto: CreateAudioDto) {
    return 'This action adds a new audio';
  }

  findAll() {
    return `This action returns all audio`;
  }

  findOne(id: number) {
    return `This action returns a #${id} audio`;
  }

  update(id: number, updateAudioDto: UpdateAudioDto) {
    return `This action updates a #${id} audio`;
  }

  remove(id: number) {
    return `This action removes a #${id} audio`;
  }

  async findAllFeaturedAudios(): Promise<Audio[]> {
    return this.audioRepository.find({ where: { is_featured: true, is_active: true } });
  }

  async findAllAudioCategoriesForCompany(companyId: string) {
    const audioCategories = await this.audioCategoryRepository.find({
      select: ['id', 'title', 'name'],
    });
  
    const companyAudioCategories = await this.companyAudioCategoryRepository.find({
      where: { company_id: companyId },
    });
  
    const companyCategoryMap = new Map<string, string>();
    companyAudioCategories.forEach(companyAudioCategory => {
      companyCategoryMap.set(companyAudioCategory.audio_category_id, companyAudioCategory.title);
    });
  
    const result = audioCategories.map(audioCategory => {
      const companyTitle = companyCategoryMap.get(audioCategory.id);
      return {
        ...audioCategory,
        title: companyTitle ? companyTitle : audioCategory.title,
      };
    });
  
    return result;
  }

  async findAudiosByCategory(categoryId: string): Promise<Audio[]> {
    return this.audioRepository
      .createQueryBuilder('audio')
      .where('audio.audio_category_ids @> :categoryId::jsonb', {
        categoryId: JSON.stringify([categoryId]),
      })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .select([
        'audio.id', 
        'audio.title', 
        'audio.audio_category_ids', 
        'audio.rental_cost', 
        'audio.bookshelf_cost', 
        'audio.is_featured', 
        'audio.available_for', 
        'audio.url'
      ])
      .getMany();
  }  

  async findAudioByCategory(categoryId: string, audioId: string): Promise<Audio> {
    const audio = await this.audioRepository
      .createQueryBuilder('audio')
      .where('audio.audio_category_ids @> :categoryId::jsonb', {
        categoryId: JSON.stringify([categoryId]),
      })
      .andWhere('audio.id = :id', { id: audioId })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .select([
        'audio.id', 
        'audio.title', 
        'audio.audio_category_ids', 
        'audio.rental_cost', 
        'audio.bookshelf_cost', 
        'audio.is_featured', 
        'audio.available_for', 
        'audio.url'
      ])
      .getOne();

    if( ! audio ){
      throw new NotFoundException(`Audio with ID ${audioId} not found`);
    }

    return audio;
  }  
}
