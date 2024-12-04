import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { UserDevice } from '../entities/user_device.entity';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { UserAudioStatus } from '../entities/user_audio_status.entity';
import { FirebaseService } from 'src/common/services/firebase.service';

@Injectable()
export class UserAudioScheduler {
  constructor(
    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,

    private readonly firebaseService: FirebaseService,
  ) {}

  // Everyday 10 am UTC time
  @Cron('0 10 * * *', {
    name: 'audio_rent_expiring_in_4_days',
  })
  async handleAudioRentExpiringInFourDays() {
    const userDevices = await this.userDeviceRepository.find({
      where: { is_active: true },
    });

    if (!userDevices.length) {
      return;
    }

    const now = new Date();
    const threeDaysLater = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 3,
    );
    const fourDaysLater = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 4,
      23,
      59,
      59,
    );

    for (const userDevice of userDevices) {
      const userRentedAudios = await this.userAudioStatusRepository.find({
        where: {
          user_id: userDevice.user_id,
          status: 'rented',
          rental_expire_at: Between(threeDaysLater, fourDaysLater),
        },
        relations: ['audio'],
      });

      if (!userRentedAudios.length) {
        continue;
      }

      userRentedAudios.forEach(async (rentedAudio) => {
        const data = {
          token: userDevice.fcm_key, // The recipient device's FCM token
          notification: {
            title: 'Expiring within 4 days',
            body: 'The audio book is expiring within 4 days. Please check.',
            image: 'http://images.findawayworld.com/v1/image/cover/CD035784',
          },
          data: {
            type: 'audio_rent_expiring',
            audio_id: rentedAudio.audio.id,
            title: rentedAudio.audio.display_title,
            author: rentedAudio.audio.display_authors,
            image: 'http://images.findawayworld.com/v1/image/cover/CD035784',
            expired_at: rentedAudio.rental_expire_at,
          },
        };

        await this.firebaseService.sendNotification(data);
      });
    }
  }

  @Cron('0 10 * * *', {
    name: 'audio_rent_expiring_in_2_days',
  })
  async handleAudioRentExpiringInTwoDays() {
    const userDevices = await this.userDeviceRepository.find({
      where: { is_active: true },
    });

    if (!userDevices.length) {
      return;
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const twoDaysLater = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + 2,
      23,
      59,
      59,
    );

    for (const userDevice of userDevices) {
      const userRentedAudios = await this.userAudioStatusRepository.find({
        where: {
          user_id: userDevice.user_id,
          status: 'rented',
          rental_expire_at: Between(today, twoDaysLater),
        },
        relations: ['audio'],
      });

      if (!userRentedAudios.length) {
        continue;
      }

      userRentedAudios.forEach(async (rentedAudio) => {
        const data = {
          token: userDevice.fcm_key, // The recipient device's FCM token
          notification: {
            title: 'Expiring within 2 days',
            body: 'The audio book is expiring within 4 days. Please check.',
            image: 'http://images.findawayworld.com/v1/image/cover/CD035784',
          },
          data: {
            type: 'audio_rent_expiring',
            audio_id: rentedAudio.audio.id,
            title: rentedAudio.audio.display_title,
            author: rentedAudio.audio.display_authors,
            image: 'http://images.findawayworld.com/v1/image/cover/CD035784',
            expired_at: rentedAudio.rental_expire_at,
          },
        };

        await this.firebaseService.sendNotification(data);
      });
    }
  }

  @Cron('0 10 * * *', {
    name: 'audio_queue_noactivity_in_1_month',
  })
  async handleAudioQueueNoActivityInOneMonth() {
    const userDevices = await this.userDeviceRepository.find({
      where: { is_active: true },
    });

    if (!userDevices.length) {
      return;
    }

    const now = new Date();
    const oneMonthLater = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    );

    for (const userDevice of userDevices) {
      const userQueuedAudios = await this.userAudioStatusRepository.find({
        where: {
          user_id: userDevice.user_id,
          status: 'queued',
          updated_at: MoreThanOrEqual(oneMonthLater),
        },
        relations: ['audio'],
      });

      if (!userQueuedAudios.length) {
        continue;
      }

      userQueuedAudios.forEach(async (queuedAudio) => {
        const data = {
          token: userDevice.fcm_key, // The recipient device's FCM token
          notification: {
            title: 'Queued audio no activity more than one month',
            body: 'The audio book has no activity after queued. Please check.',
            image: 'http://images.findawayworld.com/v1/image/cover/CD035784',
          },
          data: {
            type: 'audio_queue_noactivity',
            label: 'Queued Titles',
            slug: 'queued',
          },
        };

        await this.firebaseService.sendNotification(data);
      });
    }
  }
}
