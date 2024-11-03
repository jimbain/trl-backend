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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      CompanyCategory,
      Audio,
      AudioReview,
      UserAudioStatus,
    ]),
  ],
  controllers: [AudioController],
  providers: [AudioService, AudioReviewService, CategoryService],
})
export class AudioModule {}
