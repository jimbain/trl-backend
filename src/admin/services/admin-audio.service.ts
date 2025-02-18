import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { AdminAudioDto, AdminAudioListDto } from '../dto/audio/admin-audio.dto';
import { PaginationMeta } from 'src/common/interfaces';
import { AppConfigService } from 'src/app-config/app-config.service';
import { plainToInstance } from 'class-transformer';
import { AdminUpdateAudioDto } from '../dto/audio/admin-update-audio.dto';

@Injectable()
export class AdminAudioService {
  @InjectRepository(Audio)
  private readonly audioRepository: Repository<Audio>;

  constructor(private readonly appConfigService: AppConfigService) {}

  async findAll(query: any = {}): Promise<{
    data: AdminAudioListDto[];
    meta: PaginationMeta;
  }> {
    const page = query?.page ?? 1;
    const perPage = query?.per_page ?? 20;

    const appConfigs = await this.appConfigService.getAppConfigs([
      'audio_rental_credit_cost',
    ]);

    const queryBuilder = this.audioRepository
      .createQueryBuilder('audio')
      .leftJoinAndSelect('audio.metadata', 'metadata')
      .select([
        'audio.id',
        'audio.display_title',
        'audio.display_authors',
        'audio.avg_rating',
        'audio.total_rented',
        'audio.is_only_for_purchase',
        'audio.purchased_rental_license_limit',
        'metadata.available_for',
        'audio.bookshelf_credit_cost',
        'metadata.title',
        'metadata.authors',
        'metadata.cover_url',
        'metadata.chapters',
      ]);

    if (query.status === 'active') {
      queryBuilder.andWhere('audio.is_active = :status', { status: true });
    } else if (query.status === 'inactive') {
      queryBuilder.andWhere('audio.is_active = :status', { status: false });
    }

    if (query.title) {
      queryBuilder.andWhere(
        '(LOWER(metadata.title) LIKE LOWER(:title) OR LOWER(audio.display_title) LIKE LOWER(:title))',
        { title: `%${query.title}%` },
      );
    }

    const [audios, total] = await queryBuilder
      .skip((page - 1) * perPage)
      .take(perPage)
      .getManyAndCount();

    const from = total > 0 ? (page - 1) * perPage + 1 : null;
    const to = Math.min(page * perPage, total);

    const data = audios.map((audio) =>
      plainToInstance(
        AdminAudioListDto,
        { ...audio, rental_credit_cost: appConfigs.audio_rental_credit_cost },
        { excludeExtraneousValues: true },
      ),
    );

    return {
      data: data,
      meta: {
        current_page: page,
        per_page: perPage,
        total,
        last_page: Math.ceil(total / perPage),
        from,
        to,
      },
    };
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

    await this.audioRepository.save(audio);

    return plainToInstance(AdminAudioDto, audio, {
      excludeExtraneousValues: true,
    });
  }
}
