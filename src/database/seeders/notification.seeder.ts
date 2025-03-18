import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { Notification } from 'src/notification/entities/notification.entity';
import { User } from 'src/users/entities/user.entity';
import { NotificationService } from 'src/notification/notification.service';
import { faker } from '@faker-js/faker';

@Injectable()
export class NotificationSeeder {
  constructor(
    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    private readonly notificationService: NotificationService,
  ) {}

  async seed() {
    console.log(
      '###########################  NOTIFICATION SEEDING START  ###########################',
    );

    await this.notificationRepository.clear();

    const now = new Date();

    const users = await this.userRepository.find({
      where: { email: In(['rhasan082@gmail.com']) },
    });

    if (!users.length) {
      console.log('No users found for notifications.');
      return;
    }

    await this.audioRepository
      .createQueryBuilder()
      .update()
      .set({ is_active: true })
      .where('purchased_rental_license_limit > total_rented')
      .execute();

    const activeAudios = await this.audioRepository.find({
      where: { is_active: true },
      relations: ['metadata'],
    });

    if (!activeAudios.length) {
      console.log('No active audios found.');
      return;
    }

    await Promise.all(
      users.map((user) =>
        this.createUserNotifications(user.id, activeAudios, now),
      ),
    );

    console.log(
      '###########################  NOTIFICATION SEEDING END  ###########################',
    );
  }

  private async createUserNotifications(
    userId: string,
    activeAudios: Audio[],
    now: Date,
  ) {
    const notifications = [];

    for (let i = 0; i < 3; i++) {
      let randomAudio = this.getRandomAudio(activeAudios);

      notifications.push(
        this.notificationService.create({
          event_type: 'audio_rent_expiring_1',
          data: this.getAudioNotificationData(randomAudio, now, 3),
          user_ids: [userId],
          expire_at: this.getFutureDate(now, 1),
        }),
      );

      randomAudio = this.getRandomAudio(activeAudios);

      notifications.push(
        this.notificationService.create({
          event_type: 'audio_rent_expiring_2',
          data: this.getAudioNotificationData(randomAudio, now, 1),
          user_ids: [userId],
          expire_at: this.getFutureDate(now, 1),
        }),
      );

      randomAudio = this.getRandomAudio(activeAudios);

      notifications.push(
        this.notificationService.create({
          event_type: 'audio_queue_noactivity',
          data: {
            audio_id: randomAudio.id,
            last_played: this.getPastDate(now, 31),
          },
          user_ids: [userId],
          expire_at: this.getFutureDate(now, 1),
        }),
      );

      randomAudio = this.getRandomAudio(activeAudios);

      notifications.push(
        this.notificationService.create({
          event_type: 'audio_newbooks',
          data: {
            title: faker.commerce.productName(),
            description: faker.lorem.paragraph(),
            redirect_book_id: randomAudio.id,
          },
          user_ids: [userId],
          expire_at: this.getFutureDate(now, 1),
        }),
      );
    }

    await Promise.all(notifications);
  }

  private getRandomAudio(audios: Audio[]): Audio {
    return audios[Math.floor(Math.random() * audios.length)];
  }

  private getFutureDate(baseDate: Date, days: number): Date {
    return new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() + days,
    );
  }

  private getPastDate(baseDate: Date, days: number): Date {
    return new Date(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      baseDate.getDate() - days,
    );
  }

  private getAudioNotificationData(
    audio: Audio,
    now: Date,
    daysUntilExpire: number,
  ) {
    return {
      audio_id: audio.id,
      title: audio.metadata?.title ?? audio.display_title,
      authors: audio.metadata?.authors ?? audio.display_authors,
      image: audio.metadata?.cover_url ?? null,
      expire_at: this.getFutureDate(now, daysUntilExpire),
    };
  }
}
