import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppErrorLog } from './entities/app-error-log.entity';
import { CreateAppErrorLogDto } from './dto/create-app-error-log.dto';
import { paginate } from 'src/common/helpers/pagination.helper';
import { PaginationMeta } from 'src/common/interfaces';

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
      .select([
        'log.app_version AS app_version',
        'log.app_platform AS app_platform',
        'log.summary AS summary',
        'log.stack_trace AS stack_trace',
        "TO_CHAR(log.created_at, 'MM-DD-YYYY') AS created_at",
        'user.email AS user_email',
        'company.name AS company_name',
      ])
      .orderBy('log.created_at', 'DESC');

    return paginate(queryBuilder, page, per_page);
  }

  async create(
    createAppErrorLogDto: CreateAppErrorLogDto,
  ): Promise<AppErrorLog> {
    const appErrorLog = this.appErrorLogRepository.create(createAppErrorLogDto);
    return this.appErrorLogRepository.save(appErrorLog);
  }
}
