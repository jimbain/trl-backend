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
import { AdminReportUserActivityLogDto } from '../dto/report/admin-report-user-activity-log.dto';
import { AdminReportUserActivityLogsQueryDto } from '../dto/report/admin-report-user-activity-log-query.dto';
import { Readable } from 'stream';
import { plainToInstance } from 'class-transformer';
import { Pharma } from 'src/pharma/entities/pharma.entity';

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
      'Title,SKU,Media Type,Company,Member Name,Member Email,Title Time,Listened Time,Listened Time(%),TRL Cost,TRL Credits,Rent/Purchase,Start Date,End Date,Renewed\n',
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

        for (const item of transformedItems) {
          const row =
            [
              `"${item.audio?.title ?? ''}"`,
              `"${item.audio?.sku ?? ''}"`,
              `"${item.item_type ?? ''}"`,
              `"${item.company?.name ?? ''}"`,
              `"${item.user?.name ?? ''}"`,
              `"${item.user?.email ?? ''}"`,
              `"${item.audio?.runtime ?? ''}"`,
              `"${item.listened_time ?? ''}"`,
              `"${item.listening_percentage ?? ''}"`,
              `"${item.audio?.trl_cost ?? ''}"`,
              `"${item.trl_credit ?? ''}"`,
              `"${item.action ?? ''}"`,
              `"${item.start_date ?? ''}"`,
              `"${item.end_date ?? ''}"`,
              `"${item.is_renewed ? 'Yes' : 'No'}"`,
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
}
