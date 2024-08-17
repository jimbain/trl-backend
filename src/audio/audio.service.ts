import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AudioCategory } from 'src/audio/entities/audio_category.entity';
import { In, Repository } from 'typeorm';
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

  async findAllAudioCategoryIdOfCompany(companyId: string): Promise<string[]> {
    const companyAudioCategories = await this.companyAudioCategoryRepository.find({ where: { company_id: companyId } });
    return companyAudioCategories.map(category => category.audio_category_id);
  }

  async findAllFeaturedAudios(audioCategoryIds: string[]): Promise<Audio[]> {
    return this.audioRepository
      .createQueryBuilder('audio')
      .where(`array(SELECT jsonb_array_elements_text(audio.audio_category_ids)) && :categoryIds`, { categoryIds: audioCategoryIds })
      .andWhere('audio.is_featured = :isFeatured', { isFeatured: true })
      .andWhere('audio.is_active = :isActive', { isActive: true })
      .select([
        'audio.id',
        'audio.title',
        'audio.audio_category_ids',
        'audio.authors',
        'audio.rental_cost',
        'audio.bookshelf_cost',
        'audio.is_featured',
        'audio.available_for',
        'audio.image_url',
        'audio.url'
      ])
      .getMany();
  }
  

  async findAllAudioCategoriesForCompany(companyId: string) {
    const companyAudioCategories = await this.companyAudioCategoryRepository.find({
        where: { company_id: companyId },
        select: ['audio_category_id', 'title'],
    });

    const audioCategoryIdsWithNullTitle = companyAudioCategories
        .filter(cac => cac.title === null)
        .map(cac => cac.audio_category_id);

    let audioCategoriesMap = new Map<string, string>();

    if (audioCategoryIdsWithNullTitle.length > 0) {
        const audioCategories = await this.audioCategoryRepository.find({
            where: { id: In(audioCategoryIdsWithNullTitle) },
            select: ['id', 'title'],
        });

        audioCategoriesMap = new Map(audioCategories.map(ac => [ac.id, ac.title]));
    }

    const result = companyAudioCategories.map(companyAudioCategory => {
        const audioCategoryId = companyAudioCategory.audio_category_id;
        const title = companyAudioCategory.title ?? audioCategoriesMap.get(audioCategoryId);
        return {
          id: audioCategoryId,
          title,
          popularity: companyAudioCategory.popularity
        };
    });

    return result;
  }


  async findAudiosByCategory(companyId: string, categoryId: string): Promise<Audio[]> {
    const companyAudioCategory = await this.companyAudioCategoryRepository
          .findOne({ where: { company_id: companyId, audio_category_id: categoryId } });

    if( ! companyAudioCategory ){
      throw new NotFoundException(`Audio category with ID ${categoryId} not found for your company`);
    }

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
        'audio.authors', 
        'audio.rental_cost', 
        'audio.bookshelf_cost', 
        'audio.is_featured', 
        'audio.available_for', 
        'audio.image_url',
        'audio.url'
      ])
      .getMany();
  }  

  async findAudioById(id: string): Promise<Audio> {
    const audio = await this.audioRepository.findOne({
      where: {id},
      select: ['id', 'title', 'audio_category_ids', 'authors', 'rental_cost', 'bookshelf_cost', 'is_featured', 'available_for', 'image_url', 'url']
    });

    if( ! audio ){
      throw new NotFoundException(`Audio with ID ${id} not found`);
    }

    return audio;
  }  
}
