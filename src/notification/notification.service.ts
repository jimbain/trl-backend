import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { PaginationMeta } from 'src/common/interfaces';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  async create(payload: CreateNotificationDto) {
    const notification = this.notificationRepository.create(payload);
    return await this.notificationRepository.save(notification);
  }

  async findAll(payload: any = {}, user: User) {
    const notifications = await this.notificationRepository
      .createQueryBuilder('notification')
      .where('notification.user_ids @> :userId', {
        userId: JSON.stringify([user.id]),
      })
      .orderBy('notification.created_at', 'DESC')
      .getMany();

    const formattedNotifications = notifications.map((notification) => {
      const usersReadStatus = notification.users_read_status || {};
      let eventType = notification.event_type;

      // Normalize event_type for expiring audio rentals
      if (
        ['audio_rent_expiring_1', 'audio_rent_expiring_2'].includes(eventType)
      ) {
        eventType = 'audio_rent_expiring';
      }

      return {
        id: notification.id,
        event_type: eventType,
        data: notification.data,
        read_at: usersReadStatus[user.id] ?? null,
      };
    });

    return formattedNotifications;
  }

  async findById(id: number): Promise<Notification | undefined> {
    const notification = await this.notificationRepository.findOne({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return notification;
  }

  async read(id: number, user: User) {
    const notification = await this.findById(id);

    notification.users_read_status[user.id] = new Date();
    await this.notificationRepository.save(notification);
  }
}
