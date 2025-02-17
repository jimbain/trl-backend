import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
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
import { FirebaseService } from 'src/common/services/firebase.service';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AudioModule } from 'src/audios/audio.module';
import { UserActivityLogService } from './user_activity_log.service';

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
    forwardRef(() => AudioModule),
  ],
  controllers: [ContactUsController, ProfileController, UserAudioController],
  providers: [
    UserService,
    UserAudioService,
    UserActivityLogService,
    MailgunService,
    AudioEngineService,
    FirebaseService,
    AppConfigService,
  ],
  exports: [
    UserService,
    MailgunService,
    AudioEngineService,
    UserActivityLogService,
  ],
})
export class UserModule {}
