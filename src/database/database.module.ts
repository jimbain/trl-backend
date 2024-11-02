import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDataSourceOptions } from './data_source';
import { CompanySeeder } from 'src/database/seeders/company.seeder';
import { Company } from 'src/companies/entities/company.entity';
import { UserSeeder } from 'src/database/seeders/user.seeder';
import { User } from 'src/users/entities/user.entity';
import { CategorySeeder } from 'src/database/seeders/category.seeder';
import { CompanyCategory } from 'src/companies/entities/company_category.entity';
import { AudioSeeder } from 'src/database/seeders/audio.seeder';
import { Audio } from 'src/audios/entities/audio.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import { Category } from 'src/categories/entities/category.entity';
import { CompanyCategorySeeder } from './seeders/company_category.seeder';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { AppConfigSeeder } from './seeders/app_config.seeder';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...getDataSourceOptions(),
      }),
    }),
    TypeOrmModule.forFeature([
      Company,
      User,
      Category,
      CompanyCategory,
      Audio,
      AudioMetadata,
      AppConfig,
    ]),
  ],
  providers: [
    CompanySeeder,
    UserSeeder,
    CategorySeeder,
    CompanyCategorySeeder,
    AudioSeeder,
    AppConfigSeeder,
  ],
})
export class DatabaseModule {}
