import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { UserAudioController } from './user-audio.controller';
import { UserAudioService } from './user-audio.service';
import { Audio } from 'src/audios/entities/audio.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
import { UserAudioStatus } from './entities/user_audio_status.entity';
import { ProfileController } from './profile.controller';
import { ContactUsController } from './contact-us.controller';
import { UserActivityLog } from './entities/user_activity_log.entity';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { Company } from 'src/companies/entities/company.entity';
import { HttpModule } from '@nestjs/axios';
import { UserDevice } from './entities/user_device.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AudioModule } from 'src/audios/audio.module';
import { UserActivityLogService } from './user-activity-log.service';
import { CompanyModule } from 'src/companies/company.module';
import { CommonModule } from 'src/common/common.module';
import { UserRegistrationLog } from './entities/user_registration_log.entity';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([
      User,
      UserRegistrationLog,
      UserDevice,
      Audio,
      AudioMetadata,
      UserAudioStatus,
      UserActivityLog,
      AppConfig,
      Company,
    ]),
    forwardRef(() => AudioModule),
    forwardRef(() => CommonModule),
    forwardRef(() => CompanyModule),
  ],
  controllers: [ContactUsController, ProfileController, UserAudioController],
  providers: [
    UserService,
    UserAudioService,
    UserActivityLogService,
    AppConfigService,
  ],
  exports: [UserService, UserActivityLogService],
})
export class UserModule {}
