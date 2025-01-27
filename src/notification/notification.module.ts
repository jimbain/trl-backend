import { Module, forwardRef } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserDevice } from 'src/users/entities/user_device.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { Notification } from './entities/notification.entity';
import { UserAudioScheduler } from './schedulers/user_audio.scheduler';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { FirebaseService } from 'src/common/services/firebase.service';
import { HttpModule } from '@nestjs/axios';
import { NotificationScheduler } from './schedulers/notification.scheduler';
import { User } from 'src/users/entities/user.entity';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { AppConfigModule } from 'src/app-config/app-config.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      AppConfig,
      Notification,
      User,
      UserDevice,
      UserActivityLog,
      UserAudioStatus,
    ]),
    forwardRef(() => AppConfigModule),
  ],
  providers: [
    NotificationService,
    NotificationScheduler,
    UserAudioScheduler,
    FirebaseService,
  ],
  controllers: [NotificationController],
})
export class NotificationModule {}
