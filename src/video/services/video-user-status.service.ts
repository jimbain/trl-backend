import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { AppConfigService } from 'src/app-config/app-config.service';
import { CompanyService } from 'src/companies/company.service';
import { CachedCompany } from 'src/companies/company.interface';
import { MEDIA, USER_ACTIVITY } from 'src/constants';
import { VideoUserStatus } from '../entities/video-user-status.entity';
import { Video } from '../entities/video.entity';
import { UserActivityLogService } from 'src/users/user-activity-log.service';
import { VideoService } from './video.service';

@Injectable()
export class VideoUserStatusService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,

    @InjectRepository(VideoUserStatus)
    private readonly videoUserStatusRepository: Repository<VideoUserStatus>,

    private readonly videoService: VideoService,
    private readonly appConfigService: AppConfigService,
    private readonly userActivityLogService: UserActivityLogService,
    private readonly companyService: CompanyService,
  ) {}

  async storeUserActivityLog(
    user: User,
    video: Video,
    action: 'queue' | 'rent' | 'keep' | 'renew',
    meta: any = {},
  ) {
    const credit = Number(meta?.credit_used ?? 0);

    await this.userActivityLogService.create({
      user_id: user.id,
      item_type: MEDIA.VIDEO,
      item_id: video.id,
      action: action,
      meta: meta,
    });

    if (credit === 0) {
      return;
    }

    // Update company credit if credit was used
    await this.companyService.decreaseAvailableCredit(user.company_id, credit);
  }

  async performAction(
    videoId: string,
    action: 'queue' | 'dequeue' | 'rent' | 'renew' | 'return',
    user: User,
  ): Promise<{ message: string }> {
    const video = await this.videoService.findById(videoId);

    let userStatus = await this.videoUserStatusRepository.findOne({
      where: { video_id: video.id, user_id: user.id },
    });

    const now = new Date();
    const company: CachedCompany = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );
    const rentalDurationDays = parseInt(
      appConfigs.video_rental_duration_days || '7',
      10,
    );

    switch (action) {
      case 'queue':
        if (userStatus) {
          throw new BadRequestException('Video is already in your queue');
        }

        userStatus = this.videoUserStatusRepository.create({
          video_id: video.id,
          user_id: user.id,
          status: 'queued',
        });

        await this.videoUserStatusRepository.save(userStatus);
        await this.storeUserActivityLog(user, video, 'queue');

        return { message: 'Video added to queue successfully' };

      case 'dequeue':
        if (!userStatus || userStatus.status !== 'queued') {
          throw new BadRequestException('Video is not in your queue');
        }

        await this.videoUserStatusRepository.remove(userStatus);

        return { message: 'Video removed from queue successfully' };

      case 'rent':
        if (!userStatus || userStatus.status !== 'queued') {
          throw new BadRequestException('Video must be queued before renting');
        }

        // Check if user has enough credits
        const rentalCost = parseInt(
          appConfigs.video_rental_credit_cost || '1',
          10,
        );

        if (company.available_credits < rentalCost) {
          throw new BadRequestException('Insufficient credits to rent video');
        }

        const rentalExpireAt = new Date(
          now.getTime() + rentalDurationDays * 24 * 60 * 60 * 1000,
        );

        userStatus.status = 'rented';
        userStatus.rental_start_at = now;
        userStatus.current_rental_expire_at = rentalExpireAt;

        await this.videoUserStatusRepository.save(userStatus);
        await this.storeUserActivityLog(user, video, 'rent', {
          credit_used: rentalCost,
        });

        return { message: 'Video rented successfully' };

      case 'renew':
        if (!userStatus || userStatus.status !== 'rented') {
          throw new BadRequestException('Video is not currently rented');
        }

        // Check if renewal is allowed (e.g., within certain timeframe)
        const renewalWindowHours = parseInt(
          appConfigs.video_renewal_window_hours || '24',
          10,
        );
        const renewalCutoff = new Date(
          userStatus.current_rental_expire_at.getTime() -
            renewalWindowHours * 60 * 60 * 1000,
        );

        if (now < renewalCutoff) {
          throw new BadRequestException(
            `Video can only be renewed within ${renewalWindowHours} hours of expiration`,
          );
        }

        // Check credits for renewal
        const renewalCost = parseInt(
          appConfigs.video_rental_credit_cost || '1',
          10,
        );
        if (company.available_credits < renewalCost) {
          throw new BadRequestException('Insufficient credits to renew video');
        }

        const newExpireAt = new Date(
          userStatus.current_rental_expire_at.getTime() +
            rentalDurationDays * 24 * 60 * 60 * 1000,
        );
        userStatus.next_rental_expire_at = newExpireAt;

        await this.videoUserStatusRepository.save(userStatus);
        await this.storeUserActivityLog(user, video, 'renew', {
          credit_used: renewalCost,
        });

        return { message: 'Video rental renewed successfully' };

      case 'return':
        if (!userStatus || userStatus.status !== 'rented') {
          throw new BadRequestException('Video is not currently rented');
        }

        await this.videoUserStatusRepository.remove(userStatus);

        return { message: 'Video returned successfully' };

      default:
        throw new BadRequestException('Invalid action');
    }
  }

  async findUserVideoStatuses(
    userId: string,
    status?: 'queued' | 'rented',
  ): Promise<VideoUserStatus[]> {
    const where: any = { user_id: userId };

    if (status) {
      where.status = status;
    }

    return await this.videoUserStatusRepository.find({
      where,
      relations: ['video'],
      order: { created_at: 'DESC' },
    });
  }

  async cleanupExpiredRentals(): Promise<void> {
    const now = new Date();

    // Find expired rentals
    const expiredRentals = await this.videoUserStatusRepository.find({
      where: {
        status: 'rented',
        current_rental_expire_at: MoreThanOrEqual(now),
      },
    });

    // Remove expired rentals
    if (expiredRentals.length > 0) {
      await this.videoUserStatusRepository.remove(expiredRentals);
    }

    // Handle renewals - move next_rental_expire_at to current_rental_expire_at
    const renewals = await this.videoUserStatusRepository.find({
      where: {
        status: 'rented',
        current_rental_expire_at: MoreThanOrEqual(now),
      },
    });

    for (const renewal of renewals) {
      if (renewal.next_rental_expire_at) {
        renewal.current_rental_expire_at = renewal.next_rental_expire_at;
        renewal.next_rental_expire_at = null;
        await this.videoUserStatusRepository.save(renewal);
      }
    }
  }
}
