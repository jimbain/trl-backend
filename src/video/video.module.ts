import { forwardRef, Module } from '@nestjs/common';
import { VideoService } from './services/video.service';
import { VideoController } from './controllers/video.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from './entities/video.entity';
import { VideoUserStatus } from './entities/video-user-status.entity';
import { VideoReview } from './entities/video-review.entity';
import { StorageModule } from 'src/storage/storage.module';
import { CompanyModule } from 'src/companies/company.module';
import { CategoryModule } from 'src/categories/category.module';
import { AppConfigModule } from 'src/app-config/app-config.module';
import { VideoReviewService } from './services/video-review.service';
import { VideoReviewController } from './controllers/video-review.controller';
import { VideoUserStatusService } from './services/video-user-status.service';
import { VideoUserStatusController } from './controllers/video-user-status.controller';
import { UserModule } from 'src/users/user.module';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { CommonModule } from 'src/common/common.module';
import { AvilarIntegrationService } from './services/avilar-integration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Video,
      VideoUserStatus,
      VideoReview,
      UserActivityLog,
    ]),
    forwardRef(() => AppConfigModule),
    forwardRef(() => CommonModule),
    forwardRef(() => CompanyModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => StorageModule),
    forwardRef(() => UserModule),
  ],
  controllers: [
    VideoController,
    VideoReviewController,
    VideoUserStatusController,
  ],
  providers: [
    VideoService,
    VideoReviewService,
    VideoUserStatusService,
    AvilarIntegrationService,
  ],
  exports: [VideoService, VideoUserStatusService, AvilarIntegrationService],
})
export class VideoModule {}
