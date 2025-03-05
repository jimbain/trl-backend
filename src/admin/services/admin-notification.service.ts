import { BadRequestException, Injectable } from '@nestjs/common';
import { NotificationNewBookDto } from '../dto/notification/notification-new-book.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { Audio } from 'src/audios/entities/audio.entity';
import { User } from 'src/users/entities/user.entity';
import { UserAudioStatus } from 'src/users/entities/user_audio_status.entity';
import { UserAudioplayerPosition } from 'src/users/entities/user_audioplayer_position.entity';
import { NotificationNewBookConditionType } from 'src/constants';
import { Notification } from 'src/notification/entities/notification.entity';
import { AppConfigService } from 'src/app-config/app-config.service';

@Injectable()
export class AdminNotificationService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(UserAudioplayerPosition)
    private readonly userAudioplayerPositionRepository: Repository<UserAudioplayerPosition>,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    private readonly appConfigService: AppConfigService,
  ) {}

  async handleNewBookNotification(payload: NotificationNewBookDto) {
    await Promise.all([
      this.validateCompanyIds(payload),
      this.validateBookIds(payload),
      this.validateRedirectBookId(payload),
    ]);

    const userIds = await this.getActiveUserIds(payload.company_ids);

    if (!userIds.length) return;

    payload.conditions.map((condition) => {
      this.handleNewBookCondition(payload, condition, userIds);
    });
  }

  async validateCompanyIds(payload: NotificationNewBookDto) {
    const companyCount = await this.companyRepository.count({
      where: {
        is_active: true,
        id: In(payload.company_ids),
      },
    });

    const companyIdLength: number = payload.company_ids.length;

    if (companyCount < companyIdLength) {
      throw new BadRequestException(
        `There are ${companyIdLength - companyCount} invalid id in company_ids in the payload.`,
      );
    }
  }

  async validateBookIds(payload: NotificationNewBookDto) {
    const bookIdLength: number = payload.condition_book_ids.length;
    let bookCount: number = 0;

    if (payload.media_type === 'audio') {
      bookCount = await this.audioRepository.count({
        where: {
          is_active: true,
          id: In(payload.condition_book_ids),
        },
      });
    }

    if (bookCount < bookIdLength) {
      throw new BadRequestException(
        `There are ${bookIdLength - bookCount} invalid id in condition_book_ids in the payload.`,
      );
    }
  }

  async validateRedirectBookId(payload: NotificationNewBookDto) {
    let isBookExist: boolean = false;

    if (payload.media_type === 'audio') {
      isBookExist = await this.audioRepository.exists({
        where: {
          is_active: true,
          id: payload.redirect_book_id,
        },
      });
    } else if (payload.media_type === 'video') {
    } else if (payload.media_type === 'pharma') {
    }

    if (!isBookExist) {
      throw new BadRequestException(`Invalid redirect_book_id in the payload.`);
    }
  }

  private async getActiveUserIds(companyIds: string[]): Promise<string[]> {
    const users = await this.userRepository.find({
      where: { is_active: true, company_id: In(companyIds) },
      select: ['id'],
    });

    return users.map((user) => user.id);
  }

  private async handleNewBookCondition(
    payload: NotificationNewBookDto,
    condition: NotificationNewBookConditionType,
    userIds: string[],
  ) {
    if (payload.media_type === 'audio') {
      return this.handleAudioNewBookCondition(payload, condition, userIds);
    }
  }

  private async handleAudioNewBookCondition(
    payload: NotificationNewBookDto,
    condition: NotificationNewBookConditionType,
    userIds: string[],
  ) {
    const notificationExpiration = await this.getNotificationExpiration();
    let targetUserIds: string[] = [];

    if (condition === 'active' || condition === 'queue') {
      targetUserIds = await this.getUserIdsWithActiveOrQueuedAudios(
        payload.condition_book_ids,
        userIds,
      );
    } else if (condition === 'played') {
      targetUserIds = await this.getUserIdsWithPlayedAudios(
        payload.condition_book_ids,
        userIds,
      );
    }

    if (targetUserIds.length) {
      await this.createNotification(
        payload,
        targetUserIds,
        notificationExpiration,
      );
    }
  }

  private async getUserIdsWithActiveOrQueuedAudios(
    bookIds: string[],
    userIds: string[],
  ): Promise<string[]> {
    const userAudioStatuses = await this.userAudioStatusRepository.find({
      where: {
        user_id: In(userIds),
        audio_id: In(bookIds),
        rental_expire_at: IsNull() || LessThan(new Date()),
      },
      select: ['user_id'],
    });

    return userAudioStatuses.map((status) => status.user_id);
  }

  private async getUserIdsWithPlayedAudios(
    bookIds: string[],
    userIds: string[],
  ): Promise<string[]> {
    const userAudioPositions =
      await this.userAudioplayerPositionRepository.find({
        where: { user_id: In(userIds), audio_id: In(bookIds) },
        select: ['user_id'],
      });

    return userAudioPositions.map((position) => position.user_id);
  }

  private async createNotification(
    payload: NotificationNewBookDto,
    userIds: string[],
    expireAt: Date,
  ) {
    const notification = this.notificationRepository.create({
      event_type: 'audio_newbooks',
      data: {
        title: payload.title,
        description: payload.body,
        redirect_book_id: payload.redirect_book_id,
      },
      user_ids: userIds,
      expire_at: expireAt,
    });

    await this.notificationRepository.save(notification);
  }

  private async getNotificationExpiration(): Promise<Date> {
    const appConfigs = await this.appConfigService.getAppConfigs([
      'notification_for_new_audio_expiring_in_d_days',
    ]);

    const daysConfig =
      appConfigs['notification_for_new_audio_expiring_in_d_days'];
    const days = Number.isNaN(parseInt(daysConfig, 10))
      ? 1
      : parseInt(daysConfig, 10);

    const now = new Date();
    now.setDate(now.getDate() + days);

    return now;
  }
}
