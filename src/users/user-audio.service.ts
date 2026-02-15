import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserAudioStatus } from './entities/user_audio_status.entity';
import { UserActivityLog } from './entities/user_activity_log.entity';
import { Company } from 'src/companies/entities/company.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AudioService } from 'src/audios/audio.service';
import { CompanyService } from 'src/companies/company.service';
import { MEDIA, USER_ACTIVITY } from 'src/constants';
import { AudioElasticsearchSyncService } from 'src/audios/audio-elasticsearch-sync.service';

interface AudioFindawayworldLicensePurchase {
  id: string;
  account_id?: string;
  ext_purchase_id?: string;
  product_id?: string;
  promotion_code?: string | null;
  purchase_date?: string;
  purchase_price?: number;
  quantity?: number;
  territory?: string;
  modified_date?: string;
  invoice_cost?: number;
}

interface AudioFindawayworldLicense {
  id: string;
  checkout_id: string | null;
  account_id?: string;
  product_id?: string;
  content_id?: string;
  business_model?: string;
  territory?: string;
  modified_date?: string;
}

@Injectable()
export class UserAudioService {
  private readonly audioEngineAccountId: string;

  constructor(
    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(UserActivityLog)
    private readonly userActivityLogRepository: Repository<UserActivityLog>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    private readonly audioService: AudioService,
    private readonly audioElasticsearchSyncService: AudioElasticsearchSyncService,
    private readonly appConfigService: AppConfigService,
    private readonly audioEngineService: AudioEngineService,
    private readonly companyService: CompanyService,
    private readonly configService: ConfigService,
  ) {
    this.audioEngineAccountId = this.configService.getOrThrow<string>(
      'AUDIO_ENGINE_ACCOUNT_ID',
    );
  }

  async purchaseLicenseOfAudio(
    id: string,
    quantity: number = 1,
    productId: string,
    purchasePrice: number,
    territory: string = 'US',
  ): Promise<AudioFindawayworldLicense[]> {
    const purchaseData = {
      quantity: quantity,
      account_id: this.configService.getOrThrow<string>(
        'AUDIO_ENGINE_ACCOUNT_ID',
      ),
      product_id: productId,
      purchase_price: purchasePrice,
      territory: territory,
    };

    const data: {
      purchase: AudioFindawayworldLicensePurchase;
      licenses: AudioFindawayworldLicense[];
    } = await this.audioEngineService.post(
      `/audiobooks/${id}/purchase`,
      purchaseData,
    );
    return data.licenses;
  }

  async getLicenseForCheckoutToRentAudio(
    id: string,
  ): Promise<AudioFindawayworldLicense> {
    const audioDetails: any = await this.audioEngineService.get(
      `/accounts/${this.audioEngineAccountId}/audiobooks/${id}`,
    );

    const licenses: AudioFindawayworldLicense[] = audioDetails?.licenses ?? [];

    if (!licenses.length) {
      throw new BadRequestException(
        `There is no available licenses. Please talk to admin.`,
      );
    }

    const license =
      licenses.find((license) => license.checkout_id === null) ?? null;

    if (!license) {
      throw new BadRequestException(
        `There is no available license for checkout the audio book.`,
      );
    }

    return license;
  }

  async checkoutLicenseOfAudio(
    audio: Audio,
    license: AudioFindawayworldLicense,
    loanPeriodMinutes: number = 1500,
  ) {
    const payload = {
      license_id: license.id,
      external_listener_id: this.configService.getOrThrow<string>(
        'AUDIO_ENGINE_EXTERNAL_LISTENER_ID',
      ),
      loan_period_minutes: loanPeriodMinutes + 1,
    };

    const data: any = await this.audioEngineService.post(
      `/audiobooks/${audio.sku}/checkout`,
      payload,
    );
    console.log('data', data);
    if (data.checkout.license_id !== license.id) {
      throw new BadRequestException(`Invalid license`);
    }

    return data.checkout;
  }

  async getNextListOrder(
    userId: string,
    status: 'queued' | 'rented' | 'bookshelved',
  ): Promise<number> {
    const result = await this.userAudioStatusRepository
      .createQueryBuilder('userAudioStatus')
      .select('MAX(userAudioStatus.list_order)', 'maxListOrder')
      .where('userAudioStatus.user_id = :userId', { userId })
      .andWhere('userAudioStatus.status = :status', { status })
      .getRawOne();

    const maxListOrder = result?.maxListOrder ?? 0;
    return maxListOrder + 1;
  }

  async reorderListAfterRemoval(
    userId: string,
    status: 'queued' | 'rented' | 'bookshelved',
    removedListOrder: number,
  ): Promise<void> {
    if (!removedListOrder) return;

    // Decrement list_order for all items after the removed item
    await this.userAudioStatusRepository
      .createQueryBuilder()
      .update(UserAudioStatus)
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
    audio: Audio,
    action: 'queue' | 'rent' | 'keep' | 'renew',
    meta: any = {},
  ) {
    const credit = Number(meta?.credit_used ?? 0);

    const userActivityLog = this.userActivityLogRepository.create({
      user_id: user.id,
      item_id: audio.id,
      item_type: MEDIA.AUDIO,
      action: action,
      meta: meta,
    });

    await this.userActivityLogRepository.save(userActivityLog);

    if (credit === 0) {
      return;
    }

    await this.companyRepository.decrement(
      { id: user.company_id },
      'available_credits',
      credit,
    );
  }

  async queueAudio(audioId: string, user: User) {
    const [audio, userAudio, nextListOrder] = await Promise.all([
      this.audioService.findById(audioId),
      this.userAudioStatusRepository.findOne({
        where: {
          audio_id: audioId,
          user_id: user.id,
        },
      }),
      this.getNextListOrder(user.id, 'queued'),
    ]);

    if (userAudio) {
      throw new BadRequestException(
        `The audio book with ID ${audioId} is not available for queue.`,
      );
    }

    const queueAudio = this.userAudioStatusRepository.create({
      audio_id: audio.id,
      user_id: user.id,
      status: 'queued',
      list_order: nextListOrder,
      updated_at: new Date(),
    });

    await this.storeUserActivityLog(user, audio, USER_ACTIVITY.QUEUE, {
      credit_used: 0,
    });

    return this.userAudioStatusRepository.save(queueAudio);
  }

  async dequeueAudio(audioId: string, user: User) {
    const queuedAudio = await this.userAudioStatusRepository.findOne({
      where: {
        audio_id: audioId,
        user_id: user.id,
        status: 'queued',
      },
    });

    if (!queuedAudio) {
      throw new BadRequestException(
        `The audio book with ID ${audioId} doesn't exist in your queued list.`,
      );
    }

    const removedListOrder = queuedAudio.list_order;

    await this.userAudioStatusRepository.remove(queuedAudio);

    // Reorder remaining items
    await this.reorderListAfterRemoval(user.id, 'queued', removedListOrder);

    return {
      message: `The audio book with ID ${audioId} has been removed from your queued list.`,
    };
  }

  async rentAudio(audioId: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const rentalPeriodInHours =
      parseInt(appConfigs['audio_rental_period_in_days'], 10) ?? 24;

    const intervalStartTime = new Date(
      Date.now() - rentalPeriodInHours * 60 * 60 * 1000,
    );

    const currentTime = new Date();

    const [audio, userAudio, rentedAudioCount, rentedAudioPerPeriodCount] =
      await Promise.all([
        this.audioService.findById(audioId, ['metadata']),
        this.userAudioStatusRepository.findOne({
          where: { audio_id: audioId, user_id: user.id },
        }),
        this.userAudioStatusRepository.count({
          where: {
            user_id: user.id,
            status: 'rented',
            rental_expire_at: MoreThanOrEqual(new Date()),
          },
        }),
        this.userAudioStatusRepository.count({
          where: {
            user_id: user.id,
            status: 'rented',
            updated_at: Between(intervalStartTime, currentTime),
          },
        }),
      ]);

    if (audio.total_rented >= audio.purchased_rental_license_limit) {
      throw new BadRequestException(
        `You can't rent a book. Please talk to admin.`,
      );
    }

    const maxRentalItemsOnHand =
      parseInt(appConfigs['max_audio_rental_items_on_hand'], 10) ?? 1;

    if (rentedAudioCount >= maxRentalItemsOnHand) {
      throw new BadRequestException(
        `You already have rented ${maxRentalItemsOnHand} books, please return one book`,
      );
    }

    const maxRentalItemsPerPeriodOnHand =
      parseInt(appConfigs['max_audio_rental_items_per_period'], 10) ?? 1;

    if (rentedAudioPerPeriodCount >= maxRentalItemsPerPeriodOnHand) {
      throw new BadRequestException(
        `You can't rent more than ${maxRentalItemsPerPeriodOnHand} books within ${rentalPeriodInHours} hours.`,
      );
    }

    if (userAudio && userAudio.status === 'rented') {
      throw new BadRequestException(`Status unchanged`);
    }

    if (audio.total_rented >= audio.metadata.purchased_rental_licenses) {
      await this.purchaseLicenseOfAudio(
        audio.sku,
        1,
        audio.metadata.product_id,
        audio.metadata.findaway_price,
        'US',
      );
    }

    const rentalPeriodInDays =
      parseInt(appConfigs['audio_rental_period_in_days'], 10) ?? 14;

    const rentalExpiresAt = new Date(
      new Date().setDate(new Date().getDate() + rentalPeriodInDays),
    );

    let updatedUserAudio: UserAudioStatus;
    if (userAudio) {
      userAudio.status = 'rented';
      userAudio.updated_at = new Date();
      userAudio.rental_expire_at = rentalExpiresAt;
      userAudio.license_id = null;

      // Assign list_order if not already set
      if (!userAudio.list_order) {
        userAudio.list_order = await this.getNextListOrder(user.id, 'rented');
      }
      updatedUserAudio = userAudio;
    } else {
      const nextRentListOrder = await this.getNextListOrder(user.id, 'rented');
      updatedUserAudio = this.userAudioStatusRepository.create({
        audio_id: audioId,
        user_id: user.id,
        status: 'rented',
        updated_at: new Date(),
        rental_expire_at: rentalExpiresAt,
        license_id: null,
        list_order: nextRentListOrder,
      });
    }

    const license = await this.getLicenseForCheckoutToRentAudio(audio.sku);
    const checkout = await this.checkoutLicenseOfAudio(
      audio,
      license,
      rentalPeriodInDays * 1440,
    );
    updatedUserAudio.license_id = checkout.license_id;

    await Promise.all([
      this.userAudioStatusRepository.save(updatedUserAudio),
      this.audioRepository.update(
        { id: audioId },
        { total_rented: (audio.total_rented || 0) + 1 },
      ),
      this.storeUserActivityLog(user, audio, USER_ACTIVITY.RENT, {
        credit_used: parseInt(appConfigs['audio_rental_credit_cost'], 10) ?? 1,
        start_time: updatedUserAudio.updated_at,
        end_time: updatedUserAudio.rental_expire_at,
      }),
    ]);

    await this.audioElasticsearchSyncService.syncAudioById(audioId);

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async bookselfAudio(audioId: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const [audio, userAudio, bookshelvedAudioCount, appConfigs] =
      await Promise.all([
        this.audioService.findById(audioId, ['metadata']),
        this.userAudioStatusRepository.findOne({
          where: { audio_id: audioId, user_id: user.id },
        }),
        this.userAudioStatusRepository.count({
          where: {
            user_id: user.id,
            status: 'bookshelved',
            updated_at: Between(startOfDay, endOfDay),
          },
        }),
        this.appConfigService.getCompanyConfig(company.app_configs),
      ]);

    if (userAudio && userAudio.status === 'bookshelved') {
      throw new BadRequestException(`Status unchanged`);
    }

    const maxAudioPurchaseItemsOnHand =
      parseInt(appConfigs['max_audio_purchase_per_day'], 10) ?? 2;

    if (bookshelvedAudioCount >= maxAudioPurchaseItemsOnHand) {
      throw new BadRequestException(
        `You already have purchased ${maxAudioPurchaseItemsOnHand} books. Please try purchasing tomorrow.`,
      );
    }

    const licenses = await this.purchaseLicenseOfAudio(
      audio.sku,
      1,
      audio.metadata.retail_product_id,
      audio.metadata.findaway_retail_price,
      'US',
    );

    if (licenses.length !== 1) {
      throw new BadRequestException(
        `There is an issue while purchasing retail license.`,
      );
    }

    let updatedUserAudio: UserAudioStatus;
    if (userAudio) {
      userAudio.status = 'bookshelved';
      userAudio.updated_at = new Date();
      userAudio.rental_expire_at = null;
      userAudio.license_id = null;

      // Assign list_order if not already set
      if (!userAudio.list_order) {
        userAudio.list_order = await this.getNextListOrder(
          user.id,
          'bookshelved',
        );
      }
      updatedUserAudio = userAudio;
    } else {
      const nextBookshelfListOrder = await this.getNextListOrder(
        user.id,
        'bookshelved',
      );
      updatedUserAudio = this.userAudioStatusRepository.create({
        audio_id: audioId,
        user_id: user.id,
        status: 'bookshelved',
        updated_at: new Date(),
        rental_expire_at: null,
        license_id: null,
        list_order: nextBookshelfListOrder,
      });
    }

    const license = licenses[0];
    updatedUserAudio.license_id = license.id;

    await this.userAudioStatusRepository.save(updatedUserAudio);
    await this.storeUserActivityLog(user, audio, USER_ACTIVITY.KEEP, {
      credit_used: audio.bookshelf_credit_cost || 0,
      keep_at: updatedUserAudio.updated_at,
    });

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async renewRentedAudio(audioId: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    const [audio, appConfigs, userAudio] = await Promise.all([
      this.audioService.findById(audioId, ['metadata']),
      this.appConfigService.getCompanyConfig(company.app_configs),
      this.userAudioStatusRepository.findOne({
        where: {
          audio_id: audioId,
          user_id: user.id,
          status: 'rented',
        },
      }),
    ]);

    if (!userAudio) {
      throw new BadRequestException(
        `The audio book with ID ${audioId} doesn't exist in your rented list.`,
      );
    }

    if (audio.total_rented >= audio.purchased_rental_license_limit) {
      throw new BadRequestException(
        `You can't renew the book. Please talk to admin.`,
      );
    }

    if (audio.total_rented >= audio.metadata.purchased_rental_licenses) {
      await this.purchaseLicenseOfAudio(
        audio.sku,
        1,
        audio.metadata.product_id,
        audio.metadata.findaway_price,
        'US',
      );
    }

    const previousExpireAt = userAudio.rental_expire_at;

    const remainingTimeInMinutes = Math.max(
      0,
      Math.floor(
        (new Date(userAudio.rental_expire_at).getTime() - Date.now()) /
          (1000 * 60),
      ),
    );
    const rentalPeriodInDays =
      parseInt(appConfigs.audio_rental_period_in_days, 10) ?? 14;
    const newRentalExpireAt = userAudio.rental_expire_at
      ? new Date(
          userAudio.rental_expire_at.getTime() +
            rentalPeriodInDays * 24 * 60 * 60 * 1000,
        )
      : new Date(Date.now() + rentalPeriodInDays * 24 * 60 * 60 * 1000);

    userAudio.rental_expire_at = newRentalExpireAt;

    const license = await this.getLicenseForCheckoutToRentAudio(audio.sku);
    const checkout = await this.checkoutLicenseOfAudio(
      audio,
      license,
      rentalPeriodInDays * 1440 + remainingTimeInMinutes,
    );
    userAudio.license_id = checkout.license_id;

    await Promise.all([
      this.userAudioStatusRepository.save(userAudio),
      this.audioRepository.update(
        { id: audioId },
        { total_rented: (audio.total_rented || 0) + 1 },
      ),
      this.storeUserActivityLog(user, audio, USER_ACTIVITY.RENEW, {
        credit_used: parseInt(appConfigs['audio_rental_credit_cost'], 10) ?? 1,
        start_time: previousExpireAt,
        end_time: userAudio.rental_expire_at,
      }),
    ]);

    await this.audioElasticsearchSyncService.syncAudioById(audioId);

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async returnRentedAudio(audioId: string, user: User) {
    const userAudio = await this.userAudioStatusRepository.findOne({
      where: {
        audio_id: audioId,
        user_id: user.id,
        status: 'rented',
      },
    });

    if (!userAudio) {
      throw new BadRequestException(
        `The audio book with ID ${audioId} doesn't exist in your rented list.`,
      );
    }

    userAudio.rental_expire_at = new Date();

    const activity = await this.userActivityLogRepository.findOne({
      where: {
        user_id: user.id,
        item_type: MEDIA.AUDIO,
        item_id: audioId,
        action: USER_ACTIVITY.RENT,
      },
    });

    activity.meta.end_time = new Date();

    const [updatedUserAudio, updatedActivity] = await Promise.all([
      this.userAudioStatusRepository.save(userAudio),
      this.userActivityLogRepository.save(activity),
    ]);

    return updatedUserAudio;
  }
}
