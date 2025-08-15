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

  async storeUserActivityLog(
    user: User,
    pharma: Pharma,
    action: 'queue' | 'rent' | 'keep' | 'renew',
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
    const [pharma, pharmaUser] = await Promise.all([
      this.pharmaService.findById(id),
      this.pharmaUserStatusRepository.findOne({
        where: {
          pharma_id: id,
          user_id: user.id,
        },
      }),
    ]);

    if (pharmaUser) {
      throw new BadRequestException(
        `The pharma book with ID ${id} is not available for queue.`,
      );
    }

    const queueAudio = this.pharmaUserStatusRepository.create({
      pharma_id: id,
      user_id: user.id,
      status: 'queued',
      updated_at: new Date(),
    });

    await this.storeUserActivityLog(user, pharma, USER_ACTIVITY.QUEUE, {
      credit_used: 0,
    });

    return this.pharmaUserStatusRepository.save(queueAudio);
  }

  async dequeue(id: string, user: User) {
    const queuedPharma = await this.pharmaUserStatusRepository.findOne({
      where: {
        pharma_id: id,
        user_id: user.id,
        status: 'queued',
      },
    });

    if (!queuedPharma) {
      throw new BadRequestException(
        `The pharma book with ID ${id} doesn't exist in your queued list.`,
      );
    }

    await this.pharmaUserStatusRepository.remove(queuedPharma);
  }

  async rent(id: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    // Get rental period from config (default to 24 hours if not set)
    const rentalPeriodInHours = parseInt(
      appConfigs['pharma_rental_period_in_hours'] || '24',
      10,
    );

    const pharma = await this.pharmaService.findById(id);
    if (!pharma) {
      throw new NotFoundException(`Pharma with ID ${id} not found`);
    }

    // Check if pharma is active
    if (!pharma.is_active) {
      throw new BadRequestException(
        `Pharma with ID ${id} is not available for rental`,
      );
    }

    const pharmaUser = await this.pharmaUserStatusRepository.findOne({
      where: { pharma_id: id, user_id: user.id },
    });

    if (pharmaUser && pharmaUser.status === 'rented') {
      throw new BadRequestException(`Pharma is already rented`);
    }

    let updatedPharmaUser;
    if (pharmaUser) {
      // Update existing status
      if (!pharmaUser.rental_start_at) {
        pharmaUser.rental_start_at = new Date();
      }

      pharmaUser.status = 'rented';
      pharmaUser.current_rental_expire_at = new Date(
        Date.now() + rentalPeriodInHours * 60 * 60 * 1000,
      );
      pharmaUser.next_rental_expire_at = null;
      pharmaUser.updated_at = new Date();
      updatedPharmaUser = pharmaUser;
    } else {
      // Create new status
      updatedPharmaUser = this.pharmaUserStatusRepository.create({
        pharma_id: id,
        user_id: user.id,
        status: 'rented',
        rental_start_at: new Date(),
        current_rental_expire_at: new Date(
          Date.now() + rentalPeriodInHours * 60 * 60 * 1000,
        ),
        next_rental_expire_at: null,
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

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    // Get rental period from config
    const rentalPeriodInHours = parseInt(
      appConfigs['pharma_rental_period_in_hours'] || '24',
      10,
    );

    const pharmaUser = await this.pharmaUserStatusRepository.findOne({
      where: { pharma_id: pharmaId, user_id: user.id },
    });

    if (!pharmaUser) {
      throw new NotFoundException(
        `No rental found for pharma with ID ${pharmaId}`,
      );
    }

    if (pharmaUser.status !== 'rented') {
      throw new BadRequestException(`Pharma is not currently rented`);
    }

    // Check if current rental is still active
    const now = new Date();
    if (
      pharmaUser.current_rental_expire_at &&
      pharmaUser.current_rental_expire_at > now
    ) {
      throw new BadRequestException(
        `Cannot renew pharma while current rental is still active`,
      );
    }

    // Set next rental expire time from current rental expire time
    if (pharmaUser.current_rental_expire_at) {
      pharmaUser.next_rental_expire_at = new Date(
        pharmaUser.current_rental_expire_at.getTime() +
          rentalPeriodInHours * 60 * 60 * 1000,
      );
    } else {
      // Fallback: if no current rental expire time, extend from now
      pharmaUser.next_rental_expire_at = new Date(
        now.getTime() + rentalPeriodInHours * 60 * 60 * 1000,
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
      throw new BadRequestException(
        `The pharma with ID ${pharmaId} doesn't exist in your rented list.`,
      );
    }

    // Check if current rental has expired
    const now = new Date();
    if (
      pharmaUser.current_rental_expire_at &&
      pharmaUser.current_rental_expire_at > now
    ) {
      throw new BadRequestException(
        `Cannot return pharma while current rental is still active`,
      );
    }

    // Set next rental expire time to null
    pharmaUser.next_rental_expire_at = null;
    pharmaUser.updated_at = new Date();

    // Get pharma entity for activity log
    const pharma = await this.pharmaService.findById(pharmaId);

    await this.storeUserActivityLog(user, pharma, USER_ACTIVITY.RENT, {
      credit_used: 0,
      return_time: new Date(),
    });

    return this.pharmaUserStatusRepository.save(pharmaUser);
  }
}
