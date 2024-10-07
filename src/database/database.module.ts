import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getDataSourceOptions } from './data_source';
import { CompanySeeder } from 'src/database/seeders/company.seeder';
import { Company } from 'src/company/entities/company.entity';
import { UserSeeder } from 'src/database/seeders/user.seeder';
import { User } from 'src/user/entities/user.entity';
import { AudioCategorySeeder } from 'src/database/seeders/audio_category.seeder';
import { AudioCategory } from 'src/audio/entities/audio_category.entity';
import { CompanyAudioCategory } from 'src/company/entities/company_audio_category.entity';
import { CompanyAudioCategorySeeder } from 'src/database/seeders/company_audio_category.seeder';
import { AudioSeeder } from 'src/database/seeders/audio.seeder';
import { Audio } from 'src/audio/entities/audio.entity';

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
      CompanyAudioCategory,
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
