import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';
import { AudioController } from './audio.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AudioCategory } from './entities/audio_category.entity';
import { CompanyAudioCategory } from 'src/company/entities/company_audio_category.entity';
import { Audio } from './entities/audio.entity';
import { AudioReview } from './entities/audio_review.entity';
import { AudioReviewService } from './audio_review.service';
import { UserAudio } from 'src/user/entities/user_audio.entity';

@Module({
  imports:[
    TypeOrmModule.forFeature([AudioCategory, CompanyAudioCategory, Audio, AudioReview, UserAudio]),
  ],
  controllers: [AudioController],
  providers: [AudioService, AudioReviewService],
})
export class AudioModule {}
