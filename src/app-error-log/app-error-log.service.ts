import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppErrorLog } from './entities/app-error-log.entity';
import { CreateAppErrorLogDto } from './dto/create-app-error-log.dto';
import { paginate } from 'src/common/helpers/pagination.helper';
import { PaginationMeta } from 'src/common/interfaces';
import { ItemExtractorHelper } from './helpers/item-extractor.helper';
import { Audio } from 'src/audios/entities/audio.entity';
import { Video } from 'src/video/entities/video.entity';
import { Pharma } from 'src/pharma/entities/pharma.entity';

@Injectable()
export class AppErrorLogService {
  constructor(
    @InjectRepository(AppErrorLog)
    private readonly appErrorLogRepository: Repository<AppErrorLog>,
  ) {}

  async findAll(query: any = {}): Promise<{
    data: {
      app_version: string;
      app_platform: 'ios' | 'android';
      summary: string;
      stack_trace: string;
      meta?: Record<string, any>;
      item_type?: string;
      item_id?: string;
      title?: string;
      sku?: string;
      created_at: string;
      user_email?: string;
      company_name?: string;
    }[];
    meta: PaginationMeta;
  }> {
    const { page, per_page } = query;

    const queryBuilder = this.appErrorLogRepository
      .createQueryBuilder('log')
      .leftJoin('log.user', 'user')
      .leftJoin('user.company', 'company')
      .leftJoin(
        Audio,
        'audio',
        'audio.id = log.item_id AND log.item_type = :audioType',
        { audioType: 'audio' },
      )
      .leftJoin(
        Video,
        'video',
        'video.id = log.item_id AND log.item_type = :videoType',
        { videoType: 'video' },
      )
      .leftJoin(
        Pharma,
        'pharma',
        'pharma.id = log.item_id AND log.item_type = :pharmaType',
        { pharmaType: 'pharma' },
      )
      .select([
        'log.app_version AS app_version',
        'log.app_platform AS app_platform',
        'log.summary AS summary',
        'log.stack_trace AS stack_trace',
        'log.meta AS meta',
        'log.item_type AS item_type',
        'log.item_id AS item_id',
        `COALESCE(audio.display_title, video.title, pharma.title) AS title`,
        `COALESCE(audio.sku, video.sku, pharma.sku) AS sku`,
        "TO_CHAR(log.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York', 'MM/DD/YYYY HH12:MI AM') AS created_at",
        'user.email AS user_email',
        'company.name AS company_name',
      ])
      .orderBy('log.created_at', 'DESC');

    return paginate(queryBuilder, page, per_page);
  }

  async create(
    createAppErrorLogDto: CreateAppErrorLogDto,
  ): Promise<AppErrorLog> {
    // Extract item_type and item_id from stack_trace
    const { item_type, item_id } = ItemExtractorHelper.extractItemInfo(
      createAppErrorLogDto.stack_trace,
    );

    const appErrorLog = this.appErrorLogRepository.create({
      ...createAppErrorLogDto,
      item_type,
      item_id,
    });

    return this.appErrorLogRepository.save(appErrorLog);
  }
}
