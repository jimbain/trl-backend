import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserAudioStatus } from './entities/user_audio_status.entity';
import { UserActivityLog } from './entities/user_activity_log.entity';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { Company } from 'src/companies/entities/company.entity';

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

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  async update(
    audioId: string,
    status: 'queued' | 'rented' | 'bookshelved',
    user: User,
  ) {
    const [audio, audioRentalCost, userAudio] = await Promise.all([
      this.audioRepository.findOne({ where: { id: audioId } }),
      this.appConfigRepository.findOne({
        select: ['value'],
        where: { key: 'audio_rental_credit_cost' },
      }),
      this.userAudioStatusRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      }),
    ]);

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${audioId} not found`);
    }

    if (userAudio && userAudio.status === status) {
      throw new BadRequestException(`Status unchanged`);
    }

    const updatedUserAudio = userAudio
      ? {
          ...userAudio,
          status,
          updated_at: new Date(),
          rental_expire_at: status === 'rented' ? new Date() : null,
        }
      : this.userAudioStatusRepository.create({
          audio_id: audioId,
          user_id: user.id,
          status,
          updated_at: new Date(),
          rental_expire_at: status === 'rented' ? new Date() : null,
        });

    await this.userAudioStatusRepository.save(updatedUserAudio);

    const actionMapping = {
      queued: { action_type: 'queue', credit_used: 0 },
      rented: {
        action_type: 'rent',
        credit_used: parseInt(audioRentalCost?.value.toString() || '0', 10),
      },
      bookshelved: { action_type: 'keep', credit_used: audio.trl_cost || 0 },
    };

    const { action_type, credit_used } = actionMapping[status];

    // Log user activity
    const userActivityLog = this.userActivityLogRepository.create({
      user_id: user.id,
      item_id: audioId,
      item_type: 'audio',
      action_type,
      credit_used,
    });

    await this.userActivityLogRepository.save(userActivityLog);

    // Deduct credits if applicable
    if (credit_used > 0) {
      const company = await this.companyRepository.findOne({
        select: ['available_credits'],
        where: { id: user.company_id },
      });

      if (!company) {
        throw new NotFoundException(
          `Company with ID ${user.company_id} not found`,
        );
      }

      if (company.available_credits >= credit_used) {
        await this.companyRepository.decrement(
          { id: user.company_id },
          'available_credits',
          credit_used,
        );
      } else {
        throw new BadRequestException(
          `Insufficient credits. Available credits: ${company.available_credits}`,
        );
      }
    }

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }
}
