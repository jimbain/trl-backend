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

@Module({
  imports: [TypeOrmModule.forFeature([User, Audio, UserAudioStatus])],
  controllers: [ContactUsController, ProfileController, UserController, UserAudioController],
  providers: [UserService, UserAudioService, MailgunService],
  exports: [UserService, MailgunService],
})
export class UserModule {}
