import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CreateAppConfigDto } from './dto/create-app-config.dto';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';
import { AppConfig } from './entities/app-config.entity';

@Injectable()
export class AppConfigService {
  constructor(
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,
  ) {}

  create(createAppConfigDto: CreateAppConfigDto) {
    return 'This action adds a new appConfig';
  }

  findAll() {
    return `This action returns all appConfig`;
  }

  findOne(id: number) {
    return `This action returns a #${id} appConfig`;
  }

  update(id: number, updateAppConfigDto: UpdateAppConfigDto) {
    return `This action updates a #${id} appConfig`;
  }

  remove(id: number) {
    return `This action removes a #${id} appConfig`;
  }

  async getAppConfigs(keys: string[] = []): Promise<Record<string, any>> {
    const whereClause = keys.length > 0 ? { key: In(keys) } : {};

    const appConfigs = await this.appConfigRepository.find({
      select: ['key', 'value'],
      where: whereClause,
    });

    const configObject = appConfigs.reduce((acc, config) => {
      acc[config.key] = config.value;
      return acc;
    }, {});

    return configObject;
  }
}
