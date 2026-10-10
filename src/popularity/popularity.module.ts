import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from 'src/app-config/app-config.module';
import { Audio } from 'src/audios/entities/audio.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import { CommonModule } from 'src/common/common.module';
import { AudioModule } from 'src/audios/audio.module';
import { AudioPopularityHistory } from './entities/audio-popularity-history.entity';
import { AudioPopularityRun } from './entities/audio-popularity-run.entity';
import { AudioPopularityScore } from './entities/audio-popularity-score.entity';
import { OpenLibraryFetcher } from './services/fetchers/open-library.fetcher';
import { PopularityComposerService } from './services/popularity-composer.service';
import { PopularityRunnerService } from './services/popularity-runner.service';
import { PopularityService } from './services/popularity.service';
import { PopularityScheduler } from './schedulers/popularity.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Audio,
      AudioMetadata,
      AudioPopularityScore,
      AudioPopularityHistory,
      AudioPopularityRun,
    ]),
    HttpModule.register({
      timeout: 15_000,
      maxRedirects: 3,
    }),
    CommonModule,
    forwardRef(() => AppConfigModule),
    AudioModule,
  ],
  providers: [
    OpenLibraryFetcher,
    PopularityComposerService,
    PopularityRunnerService,
    PopularityService,
    PopularityScheduler,
  ],
  exports: [PopularityService],
})
export class PopularityModule {}
