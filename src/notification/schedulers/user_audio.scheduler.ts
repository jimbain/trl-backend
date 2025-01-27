import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { NotificationService } from '../notification.service';
import { UserActivityLog } from 'src/users/entities/user_activity_log.entity';
import { AppConfigService } from 'src/app-config/app-config.service';

@Injectable()
export class UserAudioScheduler {
  constructor(
    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(UserActivityLog)
    private readonly userActivityLogRepository: Repository<UserActivityLog>,

    private readonly appConfigService: AppConfigService,
    private readonly notificationService: NotificationService,
  ) {}

  // Everyday 01:05 am UTC time
  @Cron('5 1 * * *', {
    name: 'audio_rent_expiring_1',
  })
  async handleAudioRentExpiringOne() {
    const appConfigs = await this.appConfigService.getAppConfigs([
      'notification_audio_rent_expiring_1',
    ]);

    const notificationAudioRentExpiringDay =
      parseInt(appConfigs['notification_audio_rent_expiring_1'], 10) ?? 4;

    const now = new Date();

    const userRentedAudios = await this.userAudioStatusRepository
      .createQueryBuilder('userAudioStatus')
      .innerJoinAndSelect('userAudioStatus.audio', 'audio')
      .innerJoinAndSelect('audio.metadata', 'metadata')
      .where('userAudioStatus.status = :status', { status: 'rented' })
      .andWhere(
        `
          DATE_PART('day', userAudioStatus.rental_expire_at - :now) = :difference
        `,
        { now, difference: notificationAudioRentExpiringDay - 1 },
      )
      .getMany();

    if (!userRentedAudios.length) {
      return;
    }

    userRentedAudios.forEach(async (rentedAudio) => {
      const data = {
        event_type: 'audio_rent_expiring_1',
        data: {
          audio_id: rentedAudio.audio.id,
          title:
            rentedAudio.audio.metadata.title ?? rentedAudio.audio.display_title,
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
    const appConfigs = await this.appConfigService.getAppConfigs([
      'notification_audio_rent_expiring_2',
    ]);

    const notificationAudioRentExpiringDay =
      parseInt(appConfigs['notification_audio_rent_expiring_2'], 10) ?? 2;

    const now = new Date();

    const userRentedAudios = await this.userAudioStatusRepository
      .createQueryBuilder('userAudioStatus')
      .innerJoinAndSelect('userAudioStatus.audio', 'audio')
      .innerJoinAndSelect('audio.metadata', 'metadata')
      .where('userAudioStatus.status = :status', { status: 'rented' })
      .andWhere(
        `
          DATE_PART('day', userAudioStatus.rental_expire_at - :now) = :difference
        `,
        { now, difference: notificationAudioRentExpiringDay - 1 },
      )
      .getMany();

    if (!userRentedAudios.length) {
      return;
    }

    userRentedAudios.forEach(async (rentedAudio) => {
      const data = {
        event_type: 'audio_rent_expiring_2',
        data: {
          audio_id: rentedAudio.audio.id,
          title:
            rentedAudio.audio.metadata.title ?? rentedAudio.audio.display_title,
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
    const appConfigs = await this.appConfigService.getAppConfigs([
      'notification_audio_queue_noactivity',
    ]);

    const notificationAudioQueueNoactivityDay =
      parseInt(appConfigs['notification_audio_queue_noactivity'], 10) ?? 30;

    const thresholdDate = new Date();
    thresholdDate.setDate(
      thresholdDate.getDate() - notificationAudioQueueNoactivityDay,
    );

    const userActivityLogs = await this.userActivityLogRepository
      .createQueryBuilder('userActivityLog')
      .select('userActivityLog.user_id', 'user_id')
      .addSelect('userActivityLog.item_id', 'item_id')
      .addSelect('MAX(userActivityLog.created_at)', 'max_created_at')
      .where('userActivityLog.action_type = :actionType', {
        actionType: 'play',
      })
      .andWhere('userActivityLog.item_type = :itemType', { itemType: 'audio' })
      .groupBy('userActivityLog.user_id')
      .addGroupBy('userActivityLog.item_id')
      .having('MAX(userActivityLog.created_at) < :thresholdDate', {
        thresholdDate,
      })
      .getRawMany();

    if (!userActivityLogs.length) {
      return;
    }

    const now = new Date();

    userActivityLogs.forEach(async (log: any) => {
      const data = {
        event_type: 'audio_queue_noactivity',
        data: {
          audio_id: log.item_id,
          last_played: log.max_created_at,
        },
        recipient_type: 'user',
        recipient_id: log.user_id,
        expire_at: new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
        ),
      };

      await this.notificationService.create(data);
    });
  }
}
