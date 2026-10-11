import { Module, forwardRef } from '@nestjs/common';
import { AudioService } from './audio.service';
import { AudioController } from './audio.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audio } from './entities/audio.entity';
import { AudioReview } from './entities/audio_review.entity';
import { AudioReviewService } from './audio_review.service';
import { Category } from 'src/categories/entities/category.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { HttpModule } from '@nestjs/axios';
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { AudioSeedService } from './audio_seed.service';
import { AudioMetadata } from './entities/audio_metadata.entity';
import { AudioMetadataService } from './audio_metadata.service';
import { UserModule } from 'src/users/user.module';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CatalogModule } from 'src/catalog/catalog.module';
import { CompanyModule } from 'src/companies/company.module';
import { CategoryModule } from 'src/categories/category.module';
import { Company } from 'src/companies/entities/company.entity';
import { CommonModule } from 'src/common/common.module';
import { DeepLinkGeneratorService } from './services/deep-link-generator.service';
import { DeepLinkScheduler } from './schedulers/deep-link.scheduler';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { AudioElasticsearchSyncService } from './audio-elasticsearch-sync.service';
import { AppElasticsearchModule } from 'src/app-elasticsearch/app-elasticsearch.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      AppConfig,
      Catalog,
      Category,
      Audio,
      AudioMetadata,
      AudioReview,
      UserAudioStatus,
      UserAudioplayerPosition,
      UserActivityLog,
      Company,
    ]),
    forwardRef(() => UserModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => CatalogModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => CommonModule),
    forwardRef(() => AppElasticsearchModule),
  ],
  controllers: [AudioController],
  providers: [
    DeepLinkGeneratorService,
    DeepLinkScheduler,
    AudioService,
    AudioMetadataService,
    AudioSeedService,
    AudioReviewService,
    AudioEngineService,
    AppConfigService,
    AudioElasticsearchSyncService,
  ],
  exports: [
    DeepLinkGeneratorService,
    AudioService,
    AudioSeedService,
    AudioElasticsearchSyncService,
  ],
})
export class AudioModule {}
