import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfigModule } from 'src/app-config/app-config.module';
import { Audio } from 'src/audios/entities/audio.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import { CommonModule } from 'src/common/common.module';
import { AudioModule } from 'src/audios/audio.module';
import { AiRecommendedActiveAudio } from './entities/ai-recommended-active-audio.entity';
import { AiRecommendationRun } from './entities/ai-recommendation-run.entity';
import { AiActiveRecommendationRunnerService } from './services/ai-active-recommendation-runner.service';
import { AiActiveRecommendationService } from './services/ai-active-recommendation.service';
import { AiRecommendationService } from './services/ai-recommendation.service';
import { PythonRecommenderService } from './services/python-recommender.service';
import { AiActiveRecommendationScheduler } from './schedulers/ai-active-recommendation.scheduler';
import { AiEmbeddingBackfillScheduler } from './schedulers/ai-embedding-backfill.scheduler';
import { AiEmbeddingBackfillRunnerService } from './services/ai-embedding-backfill-runner.service';
import { PythonScriptRunnerService } from './services/python-script-runner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Audio,
      AudioMetadata,
      AiRecommendedActiveAudio,
      AiRecommendationRun,
    ]),
    CommonModule,
    forwardRef(() => AppConfigModule),
    AudioModule,
  ],
  providers: [
    PythonRecommenderService,
    AiRecommendationService,
    AiActiveRecommendationRunnerService,
    AiActiveRecommendationService,
    AiActiveRecommendationScheduler,
    PythonScriptRunnerService,
    AiEmbeddingBackfillRunnerService,
    AiEmbeddingBackfillScheduler,
  ],
  exports: [
    AiRecommendationService,
    PythonRecommenderService,
    AiActiveRecommendationService,
    AiEmbeddingBackfillRunnerService,
  ],
})
export class AiModule {}
