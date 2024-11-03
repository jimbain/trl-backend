import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserAudioStatus } from './entities/user_audio_status.entity';
import { UserActivityLog } from './entities/user_activity_log.entity';
import { AppConfig } from 'src/app-config/entities/app-config.entity';

@Injectable()
export class UserAudioService {
  constructor(
    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(UserActivityLog)
    private readonly userActivityLogRepository: Repository<UserActivityLog>,

    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,
  ) {}
  
  async update(
    audioId: string,
    status: 'queued' | 'rented' | 'bookshelved',
    user: User,
  ) {
    const audio = await this.audioRepository.findOne({
      where: { id: audioId },
    });

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${audioId} not found`);
    }

    let userAudio = await this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });

    if (userAudio) {
      userAudio.status = status;
    } else {
      userAudio = this.userAudioStatusRepository.create({
        audio_id: audioId,
        user_id: user.id,
        status: status,
      });
    }

    await this.userAudioStatusRepository.save(userAudio);

    const audioRentalCost = await this.appConfigRepository.findOne({
      select: ['value'],
      where: {
        key: 'audio_rental_credit_cost'
      }
    });

    const userActivityLog = this.userActivityLogRepository.create({
      user_id: user.id,
      item_id: audioId,
      item_type: 'audio',
      action_type: null,
      credit_used: 0
    });

    if( status === 'queued' ){
      userActivityLog.action_type = 'queue';
    }
    else if( status === 'rented' ){
      userActivityLog.action_type = 'rent';
      userActivityLog.credit_used = parseInt(audioRentalCost ? audioRentalCost.value.toString() : "0");
    }
    else if( status === 'bookshelved' ){
      userActivityLog.action_type = 'keep';
      userActivityLog.credit_used = audio.trl_cost;
    }

    await this.userActivityLogRepository.save(userActivityLog);

  }
}
