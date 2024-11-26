import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';
import { AudioController } from './audio.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audio } from './entities/audio.entity';
import { AudioReview } from './entities/audio_review.entity';
import { AudioReviewService } from './audio_review.service';
import { Category } from 'src/categories/entities/category.entity';
import { CompanyCategory } from 'src/companies/entities/company_category.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { CategoryService } from 'src/categories/category.service';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { HttpModule } from '@nestjs/axios';
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      Category,
      CompanyCategory,
      Audio,
      AudioReview,
      UserAudioStatus,
      UserAudioplayerPosition,
    ]),
  ],
  controllers: [AudioController],
  providers: [
    AudioService,
    AudioReviewService,
    CategoryService,
    AudioEngineService,
  ],
})
export class AudioModule {}
