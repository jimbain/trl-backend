import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';
import { AppConfig } from './entities/app-config.entity';

@Injectable()
export class AppConfigService {
  constructor(
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,
  ) {}

  async findAll() {
    const configurations = await this.appConfigRepository.find({
      select: ['key', 'value'],
    });

    return configurations.reduce(
      (acc, { key, value }) => {
        acc[key] = value;
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  async update(payload: UpdateAppConfigDto) {
    const keys = Object.keys(payload);

    // Fetch all the current configurations for the given keys in one query
    const existingConfigs = await this.appConfigRepository.find({
      where: { key: In(keys) },
    });

    const configsToUpdate = [];

    // Loop through each key-value pair in the payload
    for (const key of keys) {
      const value = payload[key];
      const config = existingConfigs.find((c) => c.key === key);

      config.value = value;
      configsToUpdate.push(config);
    }

    if (configsToUpdate.length > 0) {
      return this.appConfigRepository.save(configsToUpdate);
    }
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
