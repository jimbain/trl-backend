import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';
import { AudioController } from './audio.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioCategory } from './entities/audio_metadata.entity';
import { CompanyAudioCategory } from 'src/companies/entities/company_category.entity';
import { Audio } from './entities/audio.entity';
import { AudioReview } from './entities/audio_review.entity';
import { AudioReviewService } from './audio_review.service';
import { UserAudio } from 'src/users/entities/user_audio_status.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AudioCategory,
      CompanyAudioCategory,
      Audio,
      AudioReview,
      UserAudio,
    ]),
  ],
  controllers: [AudioController],
  providers: [AudioService, AudioReviewService],
})
export class AudioModule {}
