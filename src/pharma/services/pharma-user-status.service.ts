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
import { MEDIA, USER_ACTIVITY } from 'src/constants';
import { PharmaUserStatus } from '../entities/pharma-user-status.entity';
import { Pharma } from '../entities/pharma.entity';
import { UserActivityLogService } from 'src/users/user-activity-log.service';
import { PharmaService } from './pharma.service';

@Injectable()
export class PharmaUserStatusService {
  constructor(
    @InjectRepository(Pharma)
    private readonly pharmaRepository: Repository<Pharma>,

    @InjectRepository(PharmaUserStatus)
    private readonly pharmaUserStatusRepository: Repository<PharmaUserStatus>,

    private readonly pharmaService: PharmaService,
    private readonly appConfigService: AppConfigService,
    private readonly userActivityLogService: UserActivityLogService,
    private readonly companyService: CompanyService,
  ) {}

  async getNextListOrder(
    userId: string,
    status: 'queued' | 'rented',
  ): Promise<number> {
    const result = await this.pharmaUserStatusRepository
      .createQueryBuilder('pharmaUserStatus')
      .select('MAX(pharmaUserStatus.list_order)', 'maxListOrder')
      .where('pharmaUserStatus.user_id = :userId', { userId })
      .andWhere('pharmaUserStatus.status = :status', { status })
      .getRawOne();

    const maxListOrder = result?.maxListOrder ?? 0;
    return maxListOrder + 1;
  }

  async reorderListAfterRemoval(
    userId: string,
    status: 'queued' | 'rented',
    removedListOrder: number,
  ): Promise<void> {
    if (!removedListOrder) return;

    // Decrement list_order for all items after the removed item
    await this.pharmaUserStatusRepository
      .createQueryBuilder()
      .update(PharmaUserStatus)
      .set({ list_order: () => 'list_order - 1' })
      .where('user_id = :userId', { userId })
      .andWhere('status = :status', { status })
      .andWhere('list_order > :removedOrder', {
        removedOrder: removedListOrder,
      })
      .execute();
  }

  async storeUserActivityLog(
    user: User,
    pharma: Pharma,
    action: 'queue' | 'rent' | 'keep' | 'renew' | 'return',
    meta: any = {},
  ) {
    const credit = Number(meta?.credit_used ?? 0);

    await this.userActivityLogService.create({
      user_id: user.id,
      item_type: MEDIA.PHARMA,
      item_id: pharma.id,
      action: action,
      meta: meta,
    });

    if (credit === 0) {
      return;
    }

    await this.companyService.decreaseAvailableCredit(user.company_id, credit);
  }

  async queue(id: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );
    if (!company.is_active) {
      throw new BadRequestException(
        'Your company account is inactive. Please contact your administrator.',
      );
    }

    const [pharma, pharmaUser, nextListOrder] = await Promise.all([
      this.pharmaService.findById(id),
      this.pharmaUserStatusRepository.findOne({
        where: {
          pharma_id: id,
          user_id: user.id,
        },
      }),
      this.getNextListOrder(user.id, 'queued'),
    ]);

    if (pharmaUser) {
      const titleLabel =
        pharma.title && pharma.title.trim() !== ''
          ? pharma.title
          : 'this title';
      throw new BadRequestException(
        `"${titleLabel}" is not available for queue.`,
      );
    }

    const queueAudio = this.pharmaUserStatusRepository.create({
      pharma_id: id,
      user_id: user.id,
      status: 'queued',
      list_order: nextListOrder,
      updated_at: new Date(),
    });

    await this.storeUserActivityLog(user, pharma, USER_ACTIVITY.QUEUE, {
      credit_used: 0,
    });

    await this.pharmaUserStatusRepository.save(queueAudio);
  }

  async dequeue(id: string, user: User) {
    const title = await this.pharmaService.getTitleById(id);

    const titleLabel = title && title.trim() !== '' ? title : 'this title';

    const queuedPharma = await this.pharmaUserStatusRepository.findOne({
      where: {
        pharma_id: id,
        user_id: user.id,
        status: 'queued',
      },
    });

    if (!queuedPharma) {
      throw new BadRequestException(
        `"${titleLabel}" is not in your queued list.`,
      );
    }

    const removedListOrder = queuedPharma.list_order;

    await this.pharmaUserStatusRepository.remove(queuedPharma);

    // Reorder remaining items
    await this.reorderListAfterRemoval(user.id, 'queued', removedListOrder);
  }

  async rent(id: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    if (!company.is_active) {
      throw new BadRequestException(
        'Your company account is inactive. Please contact your administrator.',
      );
    }

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    // Get rental period from config (default to 14 day if not set)
    const rentalPeriodInDays = parseInt(
      appConfigs['pharma_rental_period_in_days'] || '14',
      10,
    );

    const pharma = await this.pharmaService.findById(id);
    if (!pharma) {
      throw new NotFoundException('Pharma not found.');
    }

    // Check if pharma is active
    if (!pharma.is_active) {
      const titleLabel =
        pharma.title && pharma.title.trim() !== ''
          ? pharma.title
          : 'this title';
      throw new BadRequestException(
        `"${titleLabel}" is not available for rental.`,
      );
    }

    const pharmaUser = await this.pharmaUserStatusRepository.findOne({
      where: { pharma_id: id, user_id: user.id },
    });

    if (pharmaUser && pharmaUser.status === 'rented') {
      throw new BadRequestException(`Pharma is already rented`);
    }

    let updatedPharmaUser: PharmaUserStatus;
    if (pharmaUser) {
      // Update existing status
      if (!pharmaUser.rental_start_at) {
        pharmaUser.rental_start_at = new Date();
      }

      pharmaUser.status = 'rented';
      pharmaUser.current_rental_expire_at = new Date(
        Date.now() + rentalPeriodInDays * 24 * 60 * 60 * 1000,
      );
      pharmaUser.next_rental_expire_at = null;
      pharmaUser.updated_at = new Date();

      // Assign list_order if not already set
      if (!pharmaUser.list_order) {
        pharmaUser.list_order = await this.getNextListOrder(user.id, 'rented');
      }

      updatedPharmaUser = pharmaUser;
    } else {
      // Create new status
      const nextListOrder = await this.getNextListOrder(user.id, 'rented');
      updatedPharmaUser = this.pharmaUserStatusRepository.create({
        pharma_id: id,
        user_id: user.id,
        status: 'rented',
        rental_start_at: new Date(),
        current_rental_expire_at: new Date(
          Date.now() + rentalPeriodInDays * 24 * 60 * 60 * 1000,
        ),
        next_rental_expire_at: null,
        list_order: nextListOrder,
      });
    }

    await this.storeUserActivityLog(user, pharma, USER_ACTIVITY.RENT, {
      credit_used: parseInt(appConfigs['pharma_rental_credit_cost'] || '1', 10),
      start_time: updatedPharmaUser.rental_start_at,
      end_time: updatedPharmaUser.current_rental_expire_at,
    });

    return this.pharmaUserStatusRepository.save(updatedPharmaUser);
  }

  async renew(pharmaId: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    if (!company.is_active) {
      throw new BadRequestException(
        'Your company account is inactive. Please contact your administrator.',
      );
    }

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    // Get rental period from config
    const rentalPeriodInDays = parseInt(
      appConfigs['pharma_rental_period_in_days'] || '14',
      10,
    );

    const pharmaUser = await this.pharmaUserStatusRepository.findOne({
      where: { pharma_id: pharmaId, user_id: user.id },
    });

    if (!pharmaUser) {
      const title = await this.pharmaService.getTitleById(pharmaId);
      const titleLabel = title && title.trim() !== '' ? title : 'this title';
      throw new NotFoundException(`No rental found for "${titleLabel}".`);
    }

    if (pharmaUser.status !== 'rented') {
      throw new BadRequestException(`Pharma is not currently rented`);
    }

    const now = new Date();

    if (
      (!pharmaUser.current_rental_expire_at ||
        pharmaUser.current_rental_expire_at <= now) &&
      pharmaUser.next_rental_expire_at &&
      pharmaUser.next_rental_expire_at > now
    ) {
      // Current rental expired, next rental is valid
      pharmaUser.current_rental_expire_at = pharmaUser.next_rental_expire_at;
      pharmaUser.next_rental_expire_at = new Date(
        pharmaUser.next_rental_expire_at.getTime() +
          rentalPeriodInDays * 24 * 60 * 60 * 1000,
      );
    } else if (
      pharmaUser.current_rental_expire_at &&
      pharmaUser.current_rental_expire_at > now &&
      !pharmaUser.next_rental_expire_at
    ) {
      // Current rental is valid, next rental not set
      pharmaUser.next_rental_expire_at = new Date(
        pharmaUser.current_rental_expire_at.getTime() +
          rentalPeriodInDays * 24 * 60 * 60 * 1000,
      );
    } else if (
      pharmaUser.current_rental_expire_at &&
      pharmaUser.current_rental_expire_at <= now &&
      !pharmaUser.next_rental_expire_at
    ) {
      // Both expired and no next rental → start fresh
      pharmaUser.current_rental_expire_at = new Date(
        now.getTime() + rentalPeriodInDays * 24 * 60 * 60 * 1000,
      );
    } else {
      throw new BadRequestException(
        `Cannot renew pharma. You have already extended your rental.`,
      );
    }

    pharmaUser.updated_at = new Date();

    // Get pharma entity for activity log
    const pharma = await this.pharmaService.findById(pharmaId);

    await this.storeUserActivityLog(user, pharma, USER_ACTIVITY.RENEW, {
      credit_used: parseInt(appConfigs['pharma_rental_credit_cost'] || '1', 10),
      start_time: pharmaUser.current_rental_expire_at,
      end_time: pharmaUser.next_rental_expire_at,
    });

    return this.pharmaUserStatusRepository.save(pharmaUser);
  }

  async return(pharmaId: string, user: User) {
    const pharmaUser = await this.pharmaUserStatusRepository.findOne({
      where: {
        pharma_id: pharmaId,
        user_id: user.id,
        status: 'rented',
      },
    });

    if (!pharmaUser) {
      const title = await this.pharmaService.getTitleById(pharmaId);
      const titleLabel = title && title.trim() !== '' ? title : 'this title';
      throw new BadRequestException(
        `"${titleLabel}" is not in your rented list.`,
      );
    }

    // Check if user has an advanced rental to return
    if (!pharmaUser.next_rental_expire_at) {
      throw new BadRequestException(
        `No advanced rental found to return. You can only return advanced rentals.`,
      );
    }

    // Check if current rental is still active (user is in current rent span)
    const now = new Date();
    if (
      pharmaUser.current_rental_expire_at &&
      pharmaUser.current_rental_expire_at >= now
    ) {
      // User is in current rent span, just cancel the advanced rental
      pharmaUser.next_rental_expire_at = null;
    } else {
      throw new BadRequestException(
        `Cannot return pharma. Current rental has expired.`,
      );
    }
    pharmaUser.updated_at = new Date();

    // Get pharma entity for activity log
    const pharma = await this.pharmaService.findById(pharmaId);

    await this.storeUserActivityLog(user, pharma, USER_ACTIVITY.RETURN, {
      credit_used: 0,
      return_time: new Date(),
    });

    return this.pharmaUserStatusRepository.save(pharmaUser);
  }
}
