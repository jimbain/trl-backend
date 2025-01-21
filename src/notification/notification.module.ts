import { Module } from '@nestjs/common';
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
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';
import { NotificationScheduler } from './schedulers/notification.scheduler';
import { User } from 'src/users/entities/user.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      AppConfig,
      Notification,
      User,
      UserDevice,
      UserAudioplayerPosition,
      UserAudioStatus,
    ]),
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
