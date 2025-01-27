import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from '../notification.service';
import { Notification } from '../entities/notification.entity';
import { FirebaseService } from 'src/common/services/firebase.service';
import { UserDevice } from 'src/users/entities/user_device.entity';
import { User } from 'src/users/entities/user.entity';
import { AppConfigService } from 'src/app-config/app-config.service';

@Injectable()
export class NotificationScheduler {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserDevice)
    private readonly userDeviceRepository: Repository<UserDevice>,

    private readonly appConfigService: AppConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly notificationService: NotificationService,
  ) {}

  // Everyday 10:05 am UTC time
  @Cron('5 10 * * *', {
    name: 'notification_audio_rent_expiring_1',
  })
  async handleAudioRentExpiringNotificationOne() {
    const notifications = await this.notificationRepository.find({
      where: {
        event_type: 'audio_rent_expiring_1',
      },
    });

    if (!notifications.length) {
      return;
    }

    const appConfigs = await this.appConfigService.getAppConfigs([
      'notification_audio_rent_expiring_1',
    ]);

    const notificationAudioRentExpiringDay =
      parseInt(appConfigs['notification_audio_rent_expiring_1'], 10) ?? 4;

    const body = {
      title: `Expiring within ${notificationAudioRentExpiringDay} days`,
      body: `The audio book is expiring within ${notificationAudioRentExpiringDay} days. Please check.`,
      image: null,
    };

    notifications.forEach(async (notification: any) => {
      body.image = notification.data?.image ?? null;
      if (notification.recipient_type === 'user') {
        await this.sendFirebaseNotification(
          notification,
          notification.recipient_id,
          body,
        );
      } else if (notification.recipient_type === 'company') {
        const users = await this.userRepository.find({
          where: { company_id: notification.recipient_id, is_active: true },
        });

        for (const user of users) {
          await this.sendFirebaseNotification(notification, user.id, body);
        }
      }
    });
  }

  // Everyday 10:10 am UTC time
  @Cron('10 10 * * *', {
    name: 'notification_audio_rent_expiring_2',
  })
  async handleAudioRentExpiringNotificationTwo() {
    const notifications = await this.notificationRepository.find({
      where: {
        event_type: 'audio_rent_expiring_2',
      },
    });

    if (!notifications.length) {
      return;
    }

    const appConfigs = await this.appConfigService.getAppConfigs([
      'notification_audio_rent_expiring_2',
    ]);

    const notificationAudioRentExpiringDay =
      parseInt(appConfigs['notification_audio_rent_expiring_2'], 10) ?? 2;

    const body = {
      title: `Expiring within ${notificationAudioRentExpiringDay} days`,
      body: `The audio book is expiring within ${notificationAudioRentExpiringDay} days. Please check.`,
      image: null,
    };

    notifications.forEach(async (notification: any) => {
      body.image = notification.data?.image ?? null;
      if (notification.recipient_type === 'user') {
        await this.sendFirebaseNotification(
          notification,
          notification.recipient_id,
          body,
        );
      } else if (notification.recipient_type === 'company') {
        const users = await this.userRepository.find({
          where: { company_id: notification.recipient_id, is_active: true },
        });

        for (const user of users) {
          await this.sendFirebaseNotification(notification, user.id, body);
        }
      }
    });
  }

  // Everyday 10:15 am UTC time
  @Cron('15 10 * * *', {
    name: 'notification_audio_queue_noactivity',
  })
  async handleAudioQueueNoactivityNotification() {
    const notifications = await this.notificationRepository.find({
      where: {
        event_type: 'audio_queue_noactivity',
      },
    });

    if (!notifications.length) {
      return;
    }

    const appConfigs = await this.appConfigService.getAppConfigs([
      'notification_audio_queue_noactivity',
    ]);

    const notificationAudioQueueNoactivityDay =
      parseInt(appConfigs['notification_audio_queue_noactivity'], 10) ?? 30;

    const body = {
      title: `Queued audio no activity more than ${notificationAudioQueueNoactivityDay} days.`,
      body: 'The audio book has no activity after queued. Please check.',
      image: null,
    };

    notifications.forEach(async (notification: any) => {
      body.image = notification.data?.image ?? null;
      if (notification.recipient_type === 'user') {
        await this.sendFirebaseNotification(
          notification,
          notification.recipient_id,
          body,
        );
      } else if (notification.recipient_type === 'company') {
        const users = await this.userRepository.find({
          where: { company_id: notification.recipient_id, is_active: true },
        });

        for (const user of users) {
          await this.sendFirebaseNotification(notification, user.id, body);
        }
      }
    });
  }

  async sendFirebaseNotification(
    notification: Notification,
    userId: string,
    body: object,
  ) {
    const userDevices = await this.userDeviceRepository.find({
      where: { is_active: true, user_id: userId },
    });

    if (!userDevices.length) {
      return;
    }

    for (const userDevice of userDevices) {
      const data = {
        token: userDevice.fcm_key, // The recipient device's FCM token
        notification: body,
        data: notification.data,
      };

      await this.firebaseService.sendNotification(data);
    }
  }
}
