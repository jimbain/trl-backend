import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/users/entities/user.entity';
import { UserAudioController } from './user_audio.controller';
import { UserAudioService } from './user_audio.service';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserAudioStatus } from './entities/user_audio_status.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Audio, UserAudioStatus])],
  controllers: [UserController, UserAudioController],
  providers: [UserService, UserAudioService],
  exports: [UserService],
})
export class UserModule {}
