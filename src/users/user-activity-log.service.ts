import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserActivityLog } from './entities/user_activity_log.entity';
import { CreateUserActivityLogDto } from './dto/create-user_activity_log.dto';

@Injectable()
export class UserActivityLogService {
  constructor(
    @InjectRepository(UserActivityLog)
    private readonly userActivityLogRepository: Repository<UserActivityLog>,
  ) {}

  async create(payload: CreateUserActivityLogDto) {
    const userActivityLog = this.userActivityLogRepository.create(payload);
    return await this.userActivityLogRepository.save(userActivityLog);
  }
}
