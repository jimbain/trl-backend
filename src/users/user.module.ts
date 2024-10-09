import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { UserAudioController } from './user_audio.controller';
import { UserAudioService } from './user_audio.service';
import { UserAudio } from './entities/user_audio_status.entity';
import { Audio } from 'src/audios/entities/audio.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Audio, UserAudio])],
  controllers: [UserController, UserAudioController],
  providers: [UserService, UserAudioService],
  exports: [UserService],
})
export class UserModule {}
