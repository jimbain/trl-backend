import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { AdminAudioDto, AdminAudioListDto } from '../dto/audio/admin-audio.dto';
import { AppConfigService } from 'src/app-config/app-config.service';
import { plainToInstance } from 'class-transformer';
import { AdminUpdateAudioDto } from '../dto/audio/admin-update-audio.dto';
import { CacheService } from 'src/common/services/cache.service';

@Injectable()
export class AdminAudioService {
  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  constructor(
    private readonly appConfigService: AppConfigService,
    private readonly cacheService: CacheService,
  ) {}

  async findAll(query: any = {}): Promise<any[]> {
    const {
      category_id,
      is_included_in_category,
      search_text,
      search_option,
      created_at_from,
      created_at_to,
      trl_cost,
      retail_price_min,
      retail_price_max,
      is_featured,
      is_excluded,
      order_by_column,
      order_by,
      page,
      per_page,
    } = query;

    // const page: number = query?.page ?? 1;
    // const perPage: number = query?.per_page ?? 20;
    const isIncludedInCategory: boolean =
      query?.is_included_in_category === 'false' ? false : true;
    const categoryId: string = query?.category_id ?? null;
    const sortOrder = ['asc', 'desc'].includes(query?.sort_by?.toLowerCase())
      ? query.sort_by.toUpperCase()
      : 'ASC';

    const appConfigs = await this.appConfigService.getAppConfigs([
      'audio_rental_credit_cost',
    ]);

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .innerJoin('audio.metadata', 'metadata')
      .select([
        'audio.id AS id',
        'audio.display_title AS display_title',
        'audio.display_authors AS display_authors',
        'audio.sku AS sku',
        'audio.display_copyright AS display_copyright',
        'audio.bookshelf_credit_cost AS bookshelf_credit_cost',
        'audio.created_at AS created_at',
        'metadata.available_for AS available_for',
        'metadata.title AS title',
        'metadata.authors AS authors',
        'metadata.cover_url AS cover_url',
        'metadata.copyright AS copyright',
      ]);

    if (query.status === 'active') {
      queryBuilder.andWhere('audio.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      queryBuilder.andWhere('audio.is_active = :status', { status: false });
    }

    if (query.title) {
      queryBuilder.andWhere(
        '(metadata.title ILIKE :title OR audio.display_title ILIKE :title)',
        { title: `%${query.title}%` },
      );
    }

    if (categoryId) {
      queryBuilder.andWhere(
        isIncludedInCategory
          ? 'audio.categories @> :categoryId'
          : 'NOT audio.categories @> :categoryId',
        { categoryId: JSON.stringify([categoryId]) },
      );
    }

    // queryBuilder
    //   .addSelect(
    //     'COALESCE(audio.display_title, metadata.title)',
    //     'computed_title',
    //   )
    //   .orderBy('computed_title', sortOrder as 'ASC' | 'DESC');

    const audios = await queryBuilder
      .limit(per_page)
      .offset((page - 1) * per_page)
      .getRawMany();

    return audios.map((audio) =>
      plainToInstance(
        AdminAudioListDto,
        { ...audio, rental_credit_cost: appConfigs.audio_rental_credit_cost },
        { excludeExtraneousValues: true },
      ),
    );
  }

  async findOne(id: string) {
    const audio = await this.audioRepository.findOne({
      where: { id: id },
      relations: ['metadata'],
    });

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${id} not found`);
    }

    return plainToInstance(AdminAudioDto, audio, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, payload: AdminUpdateAudioDto) {
    const audio = await this.audioRepository.findOne({
      where: { id: id },
    });

    Object.assign(audio, payload);

    await Promise.all([
      this.cacheService.delete(id),
      this.audioRepository.save(audio),
    ]);
  }
}
