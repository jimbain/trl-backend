import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import { CommonModule } from 'src/common/common.module';
import { AiRecommendationService } from './services/ai-recommendation.service';
import { PythonRecommenderService } from './services/python-recommender.service';

@Module({
  imports: [TypeOrmModule.forFeature([Audio, AudioMetadata]), CommonModule],
  providers: [PythonRecommenderService, AiRecommendationService],
  exports: [AiRecommendationService, PythonRecommenderService],
})
export class AiModule {}
