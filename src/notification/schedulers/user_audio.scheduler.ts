import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { NotificationService } from '../notification.service';
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';

@Injectable()
export class UserAudioScheduler {
  constructor(
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,

    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(UserAudioplayerPosition)
    private readonly userAudioplayerPositionRepository: Repository<UserAudioplayerPosition>,

    private readonly notificationService: NotificationService
  ) {}

  // Everyday 01:05 am UTC time
  @Cron('5 1 * * *', {
    name: 'audio_rent_expiring_1',
  })
  async handleAudioRentExpiringOne() {
    const notificationAudioRentExpiringConfig =
      await this.appConfigRepository.findOne({
        select: ['value'],
        where: { key: 'notification_audio_rent_expiring_1' },
      });

    const notificationAudioRentExpiringDay = notificationAudioRentExpiringConfig
      ? notificationAudioRentExpiringConfig
      : 4;

    const now = new Date();
    const threeDaysLater = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + (+notificationAudioRentExpiringDay - 1),
    );
    const fourDaysLater = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + +notificationAudioRentExpiringDay,
      23,
      59,
      59,
    );

    const userRentedAudios = await this.userAudioStatusRepository.find({
      where: {
        status: 'rented',
        rental_expire_at: Between(threeDaysLater, fourDaysLater),
      },
      relations: ['audio', 'audio.metadata'],
    });

    if (!userRentedAudios.length) {
      return;
    }

    userRentedAudios.forEach(async (rentedAudio) => {
      const data = {
        event_type: 'audio_rent_expiring_1',
        data: {
          audio_id: rentedAudio.audio.id,
          title:
            rentedAudio.audio.metadata.title ??
            rentedAudio.audio.display_title,
          author: 
            rentedAudio.audio.metadata.authors ??
            rentedAudio.audio.display_authors,
          image: rentedAudio.audio.metadata.cover_url ?? null,
          expired_at: rentedAudio.rental_expire_at,
        },
        recipient_type: 'user',
        recipient_id: rentedAudio.user_id,
        expire_at: new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
        ),
      };

      await this.notificationService.create(data);
    });
  }

  // Everyday 01:10 am UTC time
  @Cron('10 1 * * *', {
    name: 'audio_rent_expiring_2',
  })
  async handleAudioRentExpiringTwo() {
    const notificationAudioRentExpiringConfig =
      await this.appConfigRepository.findOne({
        select: ['value'],
        where: { key: 'notification_audio_rent_expiring_2' },
      });

    const notificationAudioRentExpiringDay = notificationAudioRentExpiringConfig
      ? notificationAudioRentExpiringConfig
      : 2;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const twoDaysLater = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + +notificationAudioRentExpiringDay,
      23,
      59,
      59,
    );

    const userRentedAudios = await this.userAudioStatusRepository.find({
      where: {
        status: 'rented',
        rental_expire_at: Between(today, twoDaysLater),
      },
      relations: ['audio', 'audio.metadata'],
    });

    if (!userRentedAudios.length) {
      return;
    }

    userRentedAudios.forEach(async (rentedAudio) => {
      const data = {
        event_type: 'audio_rent_expiring_2',
        data: {
          audio_id: rentedAudio.audio.id,
          title:
            rentedAudio.audio.metadata.title ??
            rentedAudio.audio.display_title,
          author: 
            rentedAudio.audio.metadata.authors ??
            rentedAudio.audio.display_authors,
          image: rentedAudio.audio.metadata.cover_url ?? null,
          expired_at: rentedAudio.rental_expire_at,
        },
        recipient_type: 'user',
        recipient_id: rentedAudio.user_id,
        expire_at: new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
        ),
      };

      await this.notificationService.create(data);
    });
  }

  // Everyday 01:15 am UTC time
  @Cron('15 1 * * *', {
    name: 'audio_queue_noactivity',
  })
  async handleAudioQueueNoActivityInOneMonth() {
    const notificationAudioQueueNoactivityConfig =
      await this.appConfigRepository.findOne({
        select: ['value'],
        where: { key: 'notification_audio_queue_noactivity' },
      });

    const notificationAudioQueueNoactivityDay =
      notificationAudioQueueNoactivityConfig
        ? notificationAudioQueueNoactivityConfig
        : 30;

    const now = new Date();
    const nextdayAfterInterval = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + +notificationAudioQueueNoactivityDay,
    );

    const userAudioplayerPositions = await this.userAudioplayerPositionRepository.find();
    
  }
}
