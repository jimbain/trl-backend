import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { paginate } from 'src/common/helpers/pagination.helper';
import { AdminReportUserActivityLogDto } from '../dto/report/admin-report-user-activity-log.dto';
import { AdminReportGetUserActivityLogsQueryDto } from '../dto/report/admin-report-get-user-activity-log-query.dto';

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

  async getUserActivityLogs(query: AdminReportGetUserActivityLogsQueryDto) {
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
}
