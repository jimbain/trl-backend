import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';
import { AppConfig } from './entities/app-config.entity';
import { CacheService } from 'src/common/services/cache.service';

@Injectable()
export class AppConfigService {
  private readonly CACHE_KEY: string = 'appConfigs';

  constructor(
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,

    private readonly cacheService: CacheService,
  ) {}

  async findAll() {
    const cachedAppConfig = await this.cacheService.get(this.CACHE_KEY);

    if (cachedAppConfig) return cachedAppConfig;

    const configurations = await this.appConfigRepository.find({
      select: ['key', 'value'],
      order: { key: 'ASC' },
    });

    const appConfig = configurations.reduce(
      (acc, { key, value }) => {
        acc[key] = value;
        return acc;
      },
      {} as Record<string, any>,
    );

    await this.cacheService.set(this.CACHE_KEY, appConfig);

    return appConfig;
  }

  async update(payload: UpdateAppConfigDto) {
    const keys = Object.keys(payload);

    // Fetch all the current configurations in one query
    const existingConfigs = await this.appConfigRepository.find({
      where: { key: In(keys) },
    });

    // Convert existing configs to a Map for faster lookups
    const configMap = new Map(
      existingConfigs.map((config) => [config.key, config]),
    );

    const configsToUpdate = [];

    for (const key of keys) {
      const value = payload[key];
      const config = configMap.get(key);

      if (!config) continue;

      // Only update if value is actually different
      if (config.value !== value) {
        config.value = value;
        configsToUpdate.push(config);
      }
    }

    if (configsToUpdate.length > 0) {
      await Promise.all([
        this.appConfigRepository.save(configsToUpdate),
        this.cacheService.delete(this.CACHE_KEY),
      ]);
    }

    return this.findAll();
  }

  async getCompanyConfig(companyConfig: any) {
    const appConfig = await this.findAll();
    return {
      ...appConfig,
      ...(companyConfig ?? {}),
    };
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
