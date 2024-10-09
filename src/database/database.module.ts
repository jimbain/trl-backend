import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDataSourceOptions } from './data_source';
import { CompanySeeder } from 'src/database/seeders/company.seeder';
import { Company } from 'src/companies/entities/company.entity';
import { UserSeeder } from 'src/database/seeders/user.seeder';
import { User } from 'src/users/entities/user.entity';
import { AudioCategorySeeder } from 'src/database/seeders/audio_category.seeder';
import { AudioCategory } from 'src/audios/entities/audio_metadata.entity';
import { CompanyCategory } from 'src/companies/entities/company_category.entity';
import { CompanyCategorySeeder } from 'src/database/seeders/company_category.seeder';
import { AudioSeeder } from 'src/database/seeders/audio.seeder';
import { Audio } from 'src/audios/entities/audio.entity';

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
      AudioCategory,
      CompanyCategory,
      Audio,
    ]),
  ],
  providers: [
    CompanySeeder,
    UserSeeder,
    AudioCategorySeeder,
    CompanyAudioCategorySeeder,
    AudioSeeder,
  ],
})
export class DatabaseModule {}
