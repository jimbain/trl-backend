import {
  BadRequestException,
  Injectable,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { paginate } from 'src/common/helpers/pagination.helper';
import { DateTimeHelper } from 'src/common/helpers/datetime.helper';
import { AdminReportUserActivityLogDto } from '../dto/report/admin-report-user-activity-log.dto';
import { AdminReportUserActivityLogsQueryDto } from '../dto/report/admin-report-user-activity-log-query.dto';
import { Readable } from 'stream';
import { plainToInstance } from 'class-transformer';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { VideoUserStatus } from 'src/video/entities/video-user-status.entity';
import { PharmaUserStatus } from 'src/pharma/entities/pharma-user-status.entity';
import { AdminQueuedTitlesQueryDto } from '../dto/queue/admin-queued-titles-query.dto';
import { AdminQueuedTitleDto } from '../dto/queue/admin-queued-title.dto';
import { MEDIA, USER_ACTIVITY } from 'src/constants';

export interface OverviewInterface {
  company_count: number;
  user_count: number;
  audio_count: number;
  video_count: number;
  pharma_count: number;
}

@Injectable()
export class AdminReportService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(UserActivityLog)
    private readonly userActivityLogRepository: Repository<UserActivityLog>,

    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(VideoUserStatus)
    private readonly videoUserStatusRepository: Repository<VideoUserStatus>,

    @InjectRepository(PharmaUserStatus)
    private readonly pharmaUserStatusRepository: Repository<PharmaUserStatus>,
  ) {}
  async getOverview(): Promise<OverviewInterface> {
    const [companyCount, userCount, audioCount] = await Promise.all([
      this.companyRepository.count({ where: { is_active: true } }),
      this.userRepository.count({ where: { is_active: true } }),
      this.audioRepository.count({ where: { is_active: true } }),
    ]);

    return {
      company_count: companyCount ?? 0,
      user_count: userCount ?? 0,
      audio_count: audioCount ?? 0,
      video_count: 0,
      pharma_count: 0,
    };
  }

  async getUserActivityLogs(query: AdminReportUserActivityLogsQueryDto) {
    const {
      created_at_from,
      created_at_to,
      page,
      per_page,
      company_ids,
      item_type,
      user_ids,
      is_export,
    } = query;

    const queryBuilder = this.userActivityLogRepository
      .createQueryBuilder('log')
      .leftJoin('log.user', 'user')
      .leftJoin('user.company', 'company')
      .leftJoin(
        Audio,
        'audio',
        'audio.id = log.item_id AND log.item_type = :audioType',
        {
          audioType: 'audio',
        },
      )
      .leftJoin(
        Pharma,
        'pharma',
        'pharma.id = log.item_id AND log.item_type = :type',
        {
          type: 'pharma',
        },
      )
      .leftJoin('audio.metadata', 'metadata')
      .select([
        'log.id AS id',
        'log.item_type AS item_type',
        'log.action AS action',
        'log.created_at AS created_at',
        'log.meta AS meta',
        'user.id AS user_id',
        'user.first_name AS user_first_name',
        'user.last_name AS user_last_name',
        'user.email AS user_email',
        'metadata.runtime AS metadata_runtime',
        'company.id AS company_id',
        'company.name AS company_name',
        'company.logo_url AS company_logo_url',
        'audio.id AS audio_id',
        'audio.display_title AS audio_display_title',
        'audio.sku AS audio_sku',
        'audio.bookshelf_credit_cost AS audio_bookshelf_credit_cost',
        'pharma.id AS pharma_id',
        'pharma.sku AS pharma_sku',
        'pharma.title AS pharma_title',
        'pharma.runtime AS pharma_runtime',
        `(
          SELECT COALESCE(SUM((sub_log.meta->>'total_time_played')::bigint), 0) AS total_time_played_sum_ms
          FROM user_activity_logs sub_log
          WHERE sub_log.action = 'play'
          AND sub_log.item_id = log.item_id
          AND sub_log.item_type = log.item_type
          AND (
            CASE 
              WHEN log.action IN ('rent', 'renew') THEN
                sub_log.created_at BETWEEN 
                  (log.meta->>'start_time')::timestamp AND 
                  (log.meta->>'end_time')::timestamp
              WHEN log.action = 'keep' THEN
                sub_log.created_at > (log.meta->>'keep_at')::timestamp
              ELSE FALSE
            END
          )
        ) AS listened_time_ms`,
      ])
      .where('log.action IN (:...actions)', {
        actions: ['rent', 'keep', 'renew'],
      });

    // Apply dynamic filters
    if (created_at_from) {
      queryBuilder.andWhere('DATE(log.created_at) >= :created_at_from', {
        created_at_from,
      });
    }

    if (created_at_to) {
      queryBuilder.andWhere('DATE(log.created_at) <= :created_at_to', {
        created_at_to,
      });
    }

    if (company_ids?.length) {
      queryBuilder.andWhere('company.id IN (:...company_ids)', { company_ids });
    }

    if (item_type) {
      queryBuilder.andWhere('log.item_type = :item_type', { item_type });
    }

    if (user_ids?.length) {
      queryBuilder.andWhere('user.id IN (:...user_ids)', { user_ids });
    }

    if (is_export) {
      const stream = await this.exportUserActivityLogs(queryBuilder);
      return new StreamableFile(stream);
    }

    // Apply sorting
    queryBuilder.orderBy('log.created_at', 'DESC');

    try {
      return await paginate(
        queryBuilder,
        page,
        per_page,
        AdminReportUserActivityLogDto,
      );
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch user activity logs: ${error.message}`,
      );
    }
  }

  async exportUserActivityLogs(
    queryBuilder: SelectQueryBuilder<any>,
  ): Promise<Readable> {
    const stream = new Readable({
      read() {}, // Manual stream pushing
      highWaterMark: 1024 * 1024, // 1MB buffer
    });

    // Write CSV Header
    stream.push(
      'SKU,Title,Media Type,Company,Member Name,Member Email,Start Date,End Date,Renewed,Title Time,Listened Time,Listened Time(%),TRL Cost,TRL Credits,Rent/Purchase\n',
    );

    const batchSize = 1000;
    let lastId: string | null = null;
    let hasMoreData = true;

    try {
      while (hasMoreData) {
        const qb = queryBuilder.clone();

        if (lastId) {
          qb.andWhere('log.id < :lastId', { lastId }); // cursor pagination (descending)
        }

        qb.orderBy('log.id', 'DESC').limit(batchSize);

        const items = await qb.getRawMany();
        if (!items.length) {
          hasMoreData = false;
          break;
        }

        const transformedItems = plainToInstance(
          AdminReportUserActivityLogDto,
          items,
        );

        for (let i = 0; i < transformedItems.length; i++) {
          const item = transformedItems[i];
          const rawItem = items[i];

          // Format dates for CSV export in MM/DD/YYYY format
          let startDate = '';
          let endDate = '';

          if (rawItem?.action === USER_ACTIVITY.KEEP) {
            startDate = DateTimeHelper.format(
              rawItem.meta?.keep_at,
              'MM/DD/YYYY',
            );
          } else {
            startDate = DateTimeHelper.format(
              rawItem.meta?.start_time,
              'MM/DD/YYYY',
            );
            endDate = DateTimeHelper.format(
              rawItem.meta?.end_time,
              'MM/DD/YYYY',
            );
          }

          const row =
            [
              `"${item.audio?.sku ?? ''}"`,
              `"${item.audio?.title ?? ''}"`,
              `"${item.item_type ?? ''}"`,
              `"${item.company?.name ?? ''}"`,
              `"${item.user?.name ?? ''}"`,
              `"${item.user?.email ?? ''}"`,
              `"${startDate}"`,
              `"${endDate}"`,
              `"${item.is_renewed ? 'Yes' : 'No'}"`,
              `"${item.audio?.runtime ?? ''}"`,
              `"${item.listened_time ?? ''}"`,
              `"${item.listening_percentage ?? ''}"`,
              `"${item.audio?.trl_cost ?? ''}"`,
              `"${item.trl_credit ?? ''}"`,
              `"${item.action ?? ''}"`,
            ].join(',') + '\n';

          // Respect backpressure
          const canContinue = stream.push(row);
          if (!canContinue) {
            await new Promise((resolve) => stream.once('drain', resolve));
          }
        }

        // Update cursor
        lastId = items[items.length - 1].id;
      }

      stream.push(null); // End of stream
    } catch (err) {
      stream.emit('error', err);
      stream.push(null); // Graceful end even on error
    }

    return stream;
  }

  async getQueuedTitles(query: AdminQueuedTitlesQueryDto) {
    const {
      media_type,
      company_ids,
      page = 1,
      per_page = 20,
      user_ids,
      search,
      queued_at_from,
      queued_at_to,
    } = query;

    try {
      if (media_type === MEDIA.AUDIO) {
        return this.getQueuedAudioTitles({
          company_ids,
          page,
          per_page,
          user_ids,
          search,
          queued_at_from,
          queued_at_to,
        });
      } else if (media_type === MEDIA.VIDEO) {
        return this.getQueuedVideoTitles({
          company_ids,
          page,
          per_page,
          user_ids,
          search,
          queued_at_from,
          queued_at_to,
        });
      } else if (media_type === MEDIA.PHARMA) {
        return this.getQueuedPharmaTitles({
          company_ids,
          page,
          per_page,
          user_ids,
          search,
          queued_at_from,
          queued_at_to,
        });
      } else {
        throw new BadRequestException(
          `Invalid media type: ${media_type}. Must be audio, video, or pharma.`,
        );
      }
    } catch (error) {
      throw new BadRequestException(
        `Failed to fetch queued titles: ${error.message}`,
      );
    }
  }

  private async getQueuedAudioTitles(params: {
    company_ids?: string[];
    page: number;
    per_page: number;
    user_ids?: string[];
    search?: string;
    queued_at_from?: string;
    queued_at_to?: string;
  }) {
    const {
      company_ids,
      page,
      per_page,
      user_ids,
      search,
      queued_at_from,
      queued_at_to,
    } = params;

    const queryBuilder = this.userAudioStatusRepository
      .createQueryBuilder('status')
      .innerJoin('status.user', 'user')
      .innerJoin('user.company', 'company')
      .innerJoin('status.audio', 'audio')
      .where('status.status = :status', { status: 'queued' })
      .select([
        'status.id AS id',
        'status.user_id AS user_id',
        'status.audio_id AS item_id',
        "'" + MEDIA.AUDIO + "' AS item_type",
        'user.first_name AS user_first_name',
        'user.last_name AS user_last_name',
        'user.email AS user_email',
        'user.title AS user_title',
        'company.id AS company_id',
        'company.name AS company_name',
        'company.logo_url AS company_logo_url',
        'audio.display_title AS title',
        'audio.sku AS sku',
        'status.updated_at AS queued_at',
      ]);

    if (company_ids?.length) {
      queryBuilder.andWhere('company.id IN (:...company_ids)', { company_ids });
    }

    if (user_ids?.length) {
      queryBuilder.andWhere('user.id IN (:...user_ids)', { user_ids });
    }

    if (search) {
      queryBuilder.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.email ILIKE :search OR audio.display_title ILIKE :search OR audio.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (queued_at_from) {
      queryBuilder.andWhere('DATE(status.updated_at) >= :queued_at_from', {
        queued_at_from,
      });
    }

    if (queued_at_to) {
      queryBuilder.andWhere('DATE(status.updated_at) <= :queued_at_to', {
        queued_at_to,
      });
    }

    queryBuilder.orderBy('status.updated_at', 'DESC');

    return this.buildQueuedTitleResponse(queryBuilder, page, per_page);
  }

  private async getQueuedVideoTitles(params: {
    company_ids?: string[];
    page: number;
    per_page: number;
    user_ids?: string[];
    search?: string;
    queued_at_from?: string;
    queued_at_to?: string;
  }) {
    const {
      company_ids,
      page,
      per_page,
      user_ids,
      search,
      queued_at_from,
      queued_at_to,
    } = params;

    const queryBuilder = this.videoUserStatusRepository
      .createQueryBuilder('status')
      .innerJoin('status.user', 'user')
      .innerJoin('user.company', 'company')
      .innerJoin('status.video', 'video')
      .where('status.status = :status', { status: 'queued' })
      .select([
        'status.id AS id',
        'status.user_id AS user_id',
        'status.video_id AS item_id',
        "'" + MEDIA.VIDEO + "' AS item_type",
        'user.first_name AS user_first_name',
        'user.last_name AS user_last_name',
        'user.email AS user_email',
        'user.title AS user_title',
        'company.id AS company_id',
        'company.name AS company_name',
        'company.logo_url AS company_logo_url',
        'video.title AS title',
        'video.sku AS sku',
        'status.updated_at AS queued_at',
      ]);

    if (company_ids?.length) {
      queryBuilder.andWhere('company.id IN (:...company_ids)', { company_ids });
    }

    if (user_ids?.length) {
      queryBuilder.andWhere('user.id IN (:...user_ids)', { user_ids });
    }

    if (search) {
      queryBuilder.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.email ILIKE :search OR video.title ILIKE :search OR video.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (queued_at_from) {
      queryBuilder.andWhere('DATE(status.updated_at) >= :queued_at_from', {
        queued_at_from,
      });
    }

    if (queued_at_to) {
      queryBuilder.andWhere('DATE(status.updated_at) <= :queued_at_to', {
        queued_at_to,
      });
    }

    queryBuilder.orderBy('status.updated_at', 'DESC');

    return this.buildQueuedTitleResponse(queryBuilder, page, per_page);
  }

  private async getQueuedPharmaTitles(params: {
    company_ids?: string[];
    page: number;
    per_page: number;
    user_ids?: string[];
    search?: string;
    queued_at_from?: string;
    queued_at_to?: string;
  }) {
    const {
      company_ids,
      page,
      per_page,
      user_ids,
      search,
      queued_at_from,
      queued_at_to,
    } = params;

    const queryBuilder = this.pharmaUserStatusRepository
      .createQueryBuilder('status')
      .innerJoin('status.user', 'user')
      .innerJoin('user.company', 'company')
      .innerJoin('status.pharma', 'pharma')
      .where('status.status = :status', { status: 'queued' })
      .select([
        'status.id AS id',
        'status.user_id AS user_id',
        'status.pharma_id AS item_id',
        "'" + MEDIA.PHARMA + "' AS item_type",
        'user.first_name AS user_first_name',
        'user.last_name AS user_last_name',
        'user.email AS user_email',
        'user.title AS user_title',
        'company.id AS company_id',
        'company.name AS company_name',
        'company.logo_url AS company_logo_url',
        'pharma.title AS title',
        'pharma.sku AS sku',
        'status.updated_at AS queued_at',
      ]);

    if (company_ids?.length) {
      queryBuilder.andWhere('company.id IN (:...company_ids)', { company_ids });
    }

    if (user_ids?.length) {
      queryBuilder.andWhere('user.id IN (:...user_ids)', { user_ids });
    }

    if (search) {
      queryBuilder.andWhere(
        '(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.email ILIKE :search OR pharma.title ILIKE :search OR pharma.sku ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (queued_at_from) {
      queryBuilder.andWhere('DATE(status.updated_at) >= :queued_at_from', {
        queued_at_from,
      });
    }

    if (queued_at_to) {
      queryBuilder.andWhere('DATE(status.updated_at) <= :queued_at_to', {
        queued_at_to,
      });
    }

    queryBuilder.orderBy('status.updated_at', 'DESC');

    return this.buildQueuedTitleResponse(queryBuilder, page, per_page);
  }

  private async buildQueuedTitleResponse(
    queryBuilder: SelectQueryBuilder<any>,
    page: number,
    per_page: number,
  ) {
    const { data, meta } = await paginate(queryBuilder, page, per_page);

    return {
      data: plainToInstance(AdminQueuedTitleDto, data, {
        excludeExtraneousValues: true,
      }),
      meta,
    };
  }
}
