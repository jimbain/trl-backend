import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDataSourceOptions } from './data_source';
import { CompanySeeder } from 'src/database/seeders/company.seeder';
import { Company } from 'src/companies/entities/company.entity';
import { UserSeeder } from 'src/database/seeders/user.seeder';
import { User } from 'src/users/entities/user.entity';
import { CategorySeeder } from 'src/database/seeders/category.seeder';
import { AudioSeeder } from 'src/database/seeders/audio.seeder';
import { Audio } from 'src/audios/entities/audio.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import { Category } from 'src/categories/entities/category.entity';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { AppConfigSeeder } from './seeders/app_config.seeder';
import { AudioModule } from 'src/audios/audio.module';
import { AdminUser } from 'src/admin/entities/admin_user.entity';
import { AdminUserSeeder } from './seeders/admin_user.seeder';
import { CatalogSeeder } from './seeders/catalog.seeder';
import { Catalog } from 'src/catalog/entities/catalog.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ...getDataSourceOptions(),
      }),
    }),
    TypeOrmModule.forFeature([
      AdminUser,
      Company,
      User,
      Category,
      Catalog,
      Audio,
      AudioMetadata,
      AppConfig,
    ]),
    AudioModule,
  ],
  providers: [
    AdminUserSeeder,
    AppConfigSeeder,
    CategorySeeder,
    CatalogSeeder,
    CompanySeeder,
    UserSeeder,
    AudioSeeder,
  ],
})
export class DatabaseModule {}
