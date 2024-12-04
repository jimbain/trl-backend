import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { UserAudioController } from './user_audio.controller';
import { UserAudioService } from './user_audio.service';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserAudioStatus } from './entities/user_audio_status.entity';
import { ProfileController } from './profile.controller';
import { ContactUsController } from './contact-us.controller';
import { MailgunService } from 'src/common/services/mailgun.service';
import { UserActivityLog } from './entities/user_activity_log.entity';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { Company } from 'src/companies/entities/company.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { HttpModule } from '@nestjs/axios';
import { UserDevice } from './entities/user_device.entity';
import { UserAudioScheduler } from './schedulers/user_audio.scheduler';
import { FirebaseService } from 'src/common/services/firebase.service';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      User,
      UserDevice,
      Audio,
      UserAudioStatus,
      UserActivityLog,
      AppConfig,
      Company,
    ]),
  ],
  controllers: [
    ContactUsController,
    ProfileController,
    UserController,
    UserAudioController,
  ],
  providers: [
    UserService,
    UserAudioService,
    MailgunService,
    AudioEngineService,
    FirebaseService,
    UserAudioScheduler,
  ],
  exports: [UserService, MailgunService, AudioEngineService],
})
export class UserModule {}
