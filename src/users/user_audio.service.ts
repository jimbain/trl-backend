import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { UserAudio } from './entities/user_audio_status.entity';
import { Audio } from 'src/audios/entities/audio.entity';

@Injectable()
export class UserAudioService {
  constructor(
    @InjectRepository(UserAudio)
    private readonly userAudioRepository: Repository<UserAudio>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,
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

    let userAudio = await this.userAudioRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });

    if (userAudio) {
      userAudio.status = status;
    } else {
      userAudio = this.userAudioRepository.create({
        audio_id: audioId,
        user_id: user.id,
        status: status,
      });
    }

    return this.userAudioRepository.save(userAudio);
  }
}
