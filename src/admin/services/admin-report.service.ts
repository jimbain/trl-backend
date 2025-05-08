import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { paginate } from 'src/common/helpers/pagination.helper';

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

  async getUserActivityLogs(query: any = {}) {
    const {
      page,
      per_page,
      category_id,
      is_included_in_category,
      is_active,
      search_text,
      search_for,
      is_searching_whole_word,
      street_date_from,
      street_date_to,
      bookshelf_credit_cost,
      retail_price_min,
      retail_price_max,
      retail_content_cost_min,
      retail_content_cost_max,
      is_featured,
      is_excluded,
      order_by_column,
      order_by,
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
        'log.id',
        'log.item_type',
        'log.action',
        'log.meta',
        'user.id',
        'user.first_name',
        'user.last_name',
        'user.email',
        'metadata.runtime',
        'company.id',
        'company.name',
        'company.logo_url',
        'audio.id',
        'audio.display_title',
        'audio.sku',
        'audio.bookshelf_credit_cost',
      ])
      .where('log.action IN (:...actions)', {
        actions: ['rent', 'keep', 'renew'],
      });

    const paginatedResult = await paginate(queryBuilder, page, per_page);

    return paginatedResult;
    // return logs.map((log) => ({
    //   audio:
    //     log.log_item_type === 'audio'
    //       ? {
    //           id: log.audio_id,
    //           title: log.audio_display_title,
    //           sku: log.audio_sku,
    //           runtime: log.metadata_runtime,
    //           trl_cost: log.audio_bookshelf_credit_cost,
    //         }
    //       : null,
    //   item_type: log.log_item_type,
    //   action: ['rent', 'renew'].includes(log.log_action) ? 'Rent' : 'Purchase',
    //   company: {
    //     id: log.company_id,
    //     name: log.company_name,
    //     logo: log.company_logo_url
    //       ? `${process.env.DO_BUCKET_FRONTEND_ENDPOINT}/${log.company_logo_url}`
    //       : null,
    //   },
    //   user: {
    //     id: log.user_id,
    //     first_name: log.user_first_name,
    //     last_name: log.user_last_name,
    //     email: log.user_email,
    //   },
    //   trl_credit: log.log_meta.credit_used,
    //   start_date: log.log_meta.start_time,
    //   end_date: log.log_meta.end_time,
    //   is_renewed: log.log_action === 'renew',
    // }));
  }
}
