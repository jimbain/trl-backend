import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { AudioMetadata } from 'src/audios/entities/audio_metadata.entity';
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
  private readonly logger = new Logger(UserAudioService.name);
  private readonly audioEngineAccountId: string;

  constructor(
    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(AudioMetadata)
    private readonly audioMetadataRepository: Repository<AudioMetadata>,

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

  /**
   * Checks if an action (rent or bookshelf) is allowed for an audio based on
   * the company's available_audio_title_user_action config and metadata's available_for value.
   *
   * Uses intersection logic: the final result is the most restrictive combination.
   *
   * @param audio - The audio entity with metadata
   * @param configAction - Company config: 'rent' | 'bookshelf' | 'both'
   * @param requestedAction - The requested action: 'rent' | 'bookshelf'
   * @returns boolean - true if action is allowed, false otherwise
   */
  private isActionAllowed(
    audio: Audio,
    configAction: 'rent' | 'bookshelf' | 'both' | undefined,
    requestedAction: 'rent' | 'bookshelf',
  ): boolean {
    const metadataAvailableFor = audio.metadata?.available_for;

    if (!metadataAvailableFor) {
      return false;
    }

    // If no config restriction, check metadata only
    if (!configAction) {
      if (requestedAction === 'rent') {
        return (
          metadataAvailableFor === 'rental' || metadataAvailableFor === 'both'
        );
      } else {
        return (
          metadataAvailableFor === 'purchasable' ||
          metadataAvailableFor === 'both'
        );
      }
    }

    // Check if config allows the action
    const configAllows =
      configAction === 'both' ||
      (configAction === 'rent' && requestedAction === 'rent') ||
      (configAction === 'bookshelf' && requestedAction === 'bookshelf');

    if (!configAllows) {
      return false;
    }

    // Check if metadata allows the action
    const metadataAllows =
      metadataAvailableFor === 'both' ||
      (metadataAvailableFor === 'rental' && requestedAction === 'rent') ||
      (metadataAvailableFor === 'purchasable' &&
        requestedAction === 'bookshelf');

    return metadataAllows;
  }

  async purchaseLicenseOfAudio(
    id: string,
    quantity: number = 1,
    productId: string,
    purchasePrice: number,
    territory: string = 'US',
  ): Promise<{
    purchase: AudioFindawayworldLicensePurchase;
    licenses: AudioFindawayworldLicense[];
  }> {
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
    return data;
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

    if (data.checkout.license_id !== license.id) {
      throw new BadRequestException(`Invalid license`);
    }

    return data.checkout;
  }

  async checkInLicenseOfAudio(checkoutId: string) {
    const data: any = await this.audioEngineService.put(
      `/accounts/${this.audioEngineAccountId}/checkouts/${checkoutId}`,
      {},
    );

    return data;
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
    const company = await this.companyService.findByIdWithCache(
      user.company_id,
    );

    if (!company.is_active || !user.is_active) {
      throw new BadRequestException(
        'Your account is inactive. That option is not available.',
      );
    }

    const [audio, userAudio, nextListOrder] = await Promise.all([
      this.audioService.findById(audioId),
      // Look up by (user_id, audio_id) without status filter — an expired
      // `rented` row must be found here so we update it in place instead of
      // inserting a duplicate row alongside it.
      this.userAudioStatusRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      }),
      this.getNextListOrder(user.id, 'queued'),
    ]);

    if (!audio) {
      throw new NotFoundException('Invalid audio book.');
    }

    if (userAudio) {
      if (userAudio.status === 'bookshelved') {
        throw new BadRequestException(
          'This audio book is already in your bookshelf.',
        );
      }
      if (userAudio.status === 'queued') {
        throw new BadRequestException(
          'This audio book is already in your queued list.',
        );
      }
      if (
        userAudio.status === 'rented' &&
        userAudio.rental_expire_at &&
        userAudio.rental_expire_at > new Date()
      ) {
        throw new BadRequestException(
          'You currently have an active rental for this audio book. Please return it before adding to the queue.',
        );
      }

      // status === 'rented' with an expired (or missing) rental_expire_at:
      // flip the existing row to queued instead of inserting a new one.
      userAudio.status = 'queued';
      userAudio.list_order = nextListOrder;
      userAudio.rental_expire_at = null;
      userAudio.license_id = null;
      userAudio.updated_at = new Date();

      await this.storeUserActivityLog(user, audio, USER_ACTIVITY.QUEUE, {
        credit_used: 0,
      });

      return this.userAudioStatusRepository.save(userAudio);
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

    if (!company.is_active || !user.is_active) {
      throw new BadRequestException(
        'Your account is inactive. That option is not available.',
      );
    }

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const rentalPeriodInDays =
      parseInt(appConfigs['audio_rental_period_in_days'], 10) || 14;

    const intervalStartTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const currentTime = new Date();

    const [audio, userAudio, rentedAudioCount, rentedAudioPerDayCount] =
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

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${audioId} not found.`);
    }

    // Check if rent action is allowed based on company config
    if (
      !this.isActionAllowed(
        audio,
        appConfigs.available_audio_title_user_action as
          | 'rent'
          | 'bookshelf'
          | 'both'
          | undefined,
        'rent',
      )
    ) {
      throw new BadRequestException(
        'Renting is not available for this audio due to company policy.',
      );
    }

    // Check if title is purchase-only
    if (audio.is_only_for_purchase) {
      throw new BadRequestException(
        'This title is only available for purchase, not for rental.',
      );
    }

    // Check if rental credit cost exceeds purchase credit cost
    const rentalCreditCost =
      parseInt(appConfigs['audio_rental_credit_cost'], 10) || 1;

    const purchasedRentalLicenseLimit =
      audio.purchased_rental_license_limit === null ||
      audio.purchased_rental_license_limit === undefined ||
      audio.purchased_rental_license_limit === 0
        ? audio.metadata.purchased_rental_licenses
        : audio.purchased_rental_license_limit;
    const maxPossibleRentals = audio.metadata.is_for_sale
      ? purchasedRentalLicenseLimit
      : audio.metadata.purchased_rental_licenses;

    if (audio.total_rented >= maxPossibleRentals) {
      throw new BadRequestException(
        'All current copies of this title are on loan. Please check back later.',
      );
    }

    const maxRentalItemsOnHand =
      parseInt(appConfigs['max_audio_rental_items_on_hand'], 10) || 1;

    if (rentedAudioCount >= maxRentalItemsOnHand) {
      throw new BadRequestException(
        `You already have rented ${maxRentalItemsOnHand} books, please return one book`,
      );
    }

    const maxRentalItemsPerDay =
      parseInt(appConfigs['max_audio_rental_items_per_day'], 10) || 1;

    if (rentedAudioPerDayCount >= maxRentalItemsPerDay) {
      throw new BadRequestException(
        `You can't rent more than ${maxRentalItemsPerDay} books per day.`,
      );
    }

    if (userAudio && userAudio.status === 'bookshelved') {
      throw new BadRequestException(`You have already purchased this title.`);
    }

    if (
      userAudio &&
      userAudio.status === 'rented' &&
      userAudio.rental_expire_at > new Date()
    ) {
      throw new BadRequestException(`Status unchanged`);
    }

    if (
      audio.metadata.is_for_sale &&
      audio.total_rented >= audio.metadata.purchased_rental_licenses &&
      audio.metadata.purchased_rental_licenses < purchasedRentalLicenseLimit
    ) {
      // Use transaction to prevent race condition during auto-purchase
      const queryRunner =
        this.audioMetadataRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Lock the audio_metadata row to prevent concurrent modifications
        const lockedMetadata = await queryRunner.manager
          .createQueryBuilder(AudioMetadata, 'metadata')
          .setLock('pessimistic_write')
          .where('metadata.sku = :sku', { sku: audio.sku })
          .getOne();

        // Re-check condition after acquiring lock (double-check pattern)
        // Another concurrent request may have already purchased the license
        if (
          lockedMetadata &&
          lockedMetadata.purchased_rental_licenses >=
            purchasedRentalLicenseLimit
        ) {
          // Limit reached by concurrent request, abort auto-purchase
          await queryRunner.commitTransaction();
          throw new BadRequestException(
            'All current copies of this title are on loan. Please check back later.',
          );
        }

        // Purchase license from audio engine (inside transaction)
        await this.purchaseLicenseOfAudio(
          audio.sku,
          1,
          audio.metadata.product_id,
          audio.metadata.findaway_price,
          'US',
        );

        // Update DB within transaction (atomic with purchase)
        await queryRunner.manager.update(
          AudioMetadata,
          { sku: audio.sku },
          {
            purchased_rental_licenses:
              lockedMetadata.purchased_rental_licenses + 1,
          },
        );

        // Commit transaction
        await queryRunner.commitTransaction();

        // Update local object only after successful commit
        audio.metadata.purchased_rental_licenses =
          lockedMetadata.purchased_rental_licenses + 1;

        this.logger.log(
          `Auto-purchased license for audio ${audio.sku}, new count: ${audio.metadata.purchased_rental_licenses}`,
        );
      } catch (error) {
        // Rollback on any failure (purchase API error OR DB error). Guarded
        // so we don't call rollback after the limit-reached path has already
        // committed — that would throw TransactionNotActiveError.
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        this.logger.error(
          `Auto-purchase failed for audio ${audio.sku}: ${error.message}`,
          error.stack,
        );
        throw new BadRequestException(
          'Unable to process rental at this time. Please try again.',
        );
      } finally {
        await queryRunner.release();
      }
    }

    const rentalExpiresAt = new Date(
      Date.now() + rentalPeriodInDays * 24 * 60 * 60 * 1000,
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
    updatedUserAudio.meta = {
      ...(updatedUserAudio.meta || {}),
      inaudio_checkout_response: checkout,
    };

    try {
      await Promise.all([
        this.userAudioStatusRepository.save(updatedUserAudio),
        this.audioRepository
          .createQueryBuilder()
          .update(Audio)
          .set({ total_rented: () => 'total_rented + 1' })
          .where('id = :id', { id: audioId })
          .execute(),
        this.storeUserActivityLog(user, audio, USER_ACTIVITY.RENT, {
          credit_used: rentalCreditCost,
          start_time: updatedUserAudio.updated_at,
          end_time: updatedUserAudio.rental_expire_at,
          inaudio_license_id: checkout.license_id,
        }),
      ]);
    } catch (error: any) {
      // License is checked out at Inaudio but local persistence failed.
      // Surfacing for ops until checkin support lands.
      this.logger.error(
        `Inaudio checkout succeeded but local persistence failed. sku=${audio.sku} license_id=${checkout.license_id} user_id=${user.id}: ${error?.message}`,
        error?.stack,
      );
      throw error;
    }

    await this.audioElasticsearchSyncService.syncAudioById(audioId);

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async bookselfAudio(audioId: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    if (!company.is_active || !user.is_active) {
      throw new BadRequestException(
        'Your account is inactive. That option is not available.',
      );
    }

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

    // Check if bookshelf action is allowed based on company config
    if (
      !this.isActionAllowed(
        audio,
        appConfigs.available_audio_title_user_action as
          | 'rent'
          | 'bookshelf'
          | 'both'
          | undefined,
        'bookshelf',
      )
    ) {
      throw new BadRequestException(
        'Adding to bookshelf is not available for this audio due to company policy.',
      );
    }

    if (userAudio && userAudio.status === 'bookshelved') {
      throw new BadRequestException(`Status unchanged`);
    }

    const maxAudioPurchaseItemsOnHand =
      parseInt(appConfigs['max_audio_purchase_per_day'], 10) || 2;

    if (bookshelvedAudioCount >= maxAudioPurchaseItemsOnHand) {
      throw new BadRequestException(
        `You already have purchased ${maxAudioPurchaseItemsOnHand} books. Please try purchasing tomorrow.`,
      );
    }

    const purchaseResponse = await this.purchaseLicenseOfAudio(
      audio.sku,
      1,
      audio.metadata.retail_product_id,
      audio.metadata.findaway_retail_price,
      'US',
    );

    if (purchaseResponse.licenses.length !== 1) {
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

    const license = purchaseResponse.licenses[0];
    updatedUserAudio.license_id = license.id;
    updatedUserAudio.meta = {
      ...(updatedUserAudio.meta || {}),
      inaudio_purchase_response: purchaseResponse,
    };

    await this.userAudioStatusRepository.save(updatedUserAudio);
    await this.storeUserActivityLog(user, audio, USER_ACTIVITY.KEEP, {
      credit_used: audio.bookshelf_credit_cost || 0,
      keep_at: updatedUserAudio.updated_at,
      inaudio_license_id: license.id,
    });

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async renewRentedAudio(audioId: string, user: User) {
    const company = await this.companyService.findByIdWithCache(
      user.company.id,
    );

    if (!company.is_active || !user.is_active) {
      throw new BadRequestException(
        'Your account is inactive. That option is not available.',
      );
    }

    const appConfigs = await this.appConfigService.getCompanyConfig(
      company.app_configs,
    );

    const rentalPeriodInDays =
      parseInt(appConfigs['audio_rental_period_in_days'], 10) || 14;

    const intervalStartTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const currentTime = new Date();

    const [audio, userAudio, rentedAudioCount, rentedAudioPerDayCount] =
      await Promise.all([
        this.audioService.findById(audioId, ['metadata']),
        this.userAudioStatusRepository.findOne({
          where: {
            audio_id: audioId,
            user_id: user.id,
            status: 'rented',
          },
        }),
        // On-hand count — exclude the audio being renewed so the user's own
        // current rental doesn't trip its own limit.
        this.userAudioStatusRepository.count({
          where: {
            user_id: user.id,
            status: 'rented',
            rental_expire_at: MoreThanOrEqual(new Date()),
            audio_id: Not(audioId),
          },
        }),
        // Per-day count — same self-exclusion.
        this.userAudioStatusRepository.count({
          where: {
            user_id: user.id,
            status: 'rented',
            updated_at: Between(intervalStartTime, currentTime),
            audio_id: Not(audioId),
          },
        }),
      ]);

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${audioId} not found.`);
    }

    if (!userAudio) {
      throw new BadRequestException(
        `The audio book with ID ${audioId} doesn't exist in your rented list.`,
      );
    }

    if (
      !this.isActionAllowed(
        audio,
        appConfigs.available_audio_title_user_action as
          | 'rent'
          | 'bookshelf'
          | 'both'
          | undefined,
        'rent',
      )
    ) {
      throw new BadRequestException(
        'Renewing is not available for this audio due to company policy.',
      );
    }

    if (audio.is_only_for_purchase) {
      throw new BadRequestException(
        'This title is only available for purchase, not for rental.',
      );
    }

    const rentalCreditCost =
      parseInt(appConfigs['audio_rental_credit_cost'], 10) || 1;

    // The renewing user already counts in audio.total_rented. Subtract one so
    // exhaustion / auto-purchase checks reflect what's available AFTER the
    // pending checkin frees their license back to the pool.
    const effectiveTotalRented = Math.max(0, audio.total_rented - 1);

    const purchasedRentalLicenseLimit =
      audio.purchased_rental_license_limit === null ||
      audio.purchased_rental_license_limit === undefined ||
      audio.purchased_rental_license_limit === 0
        ? audio.metadata.purchased_rental_licenses
        : audio.purchased_rental_license_limit;

    const maxPossibleRentals = audio.metadata.is_for_sale
      ? purchasedRentalLicenseLimit
      : audio.metadata.purchased_rental_licenses;

    if (effectiveTotalRented >= maxPossibleRentals) {
      throw new BadRequestException(
        'All current copies of this title are on loan. Please check back later.',
      );
    }

    const maxRentalItemsOnHand =
      parseInt(appConfigs['max_audio_rental_items_on_hand'], 10) || 1;

    if (rentedAudioCount >= maxRentalItemsOnHand) {
      throw new BadRequestException(
        `You already have rented ${maxRentalItemsOnHand} books, please return one book`,
      );
    }

    const maxRentalItemsPerDay =
      parseInt(appConfigs['max_audio_rental_items_per_day'], 10) || 1;

    if (rentedAudioPerDayCount >= maxRentalItemsPerDay) {
      throw new BadRequestException(
        `You can't rent more than ${maxRentalItemsPerDay} books per day.`,
      );
    }

    if (
      audio.metadata.is_for_sale &&
      effectiveTotalRented >= audio.metadata.purchased_rental_licenses &&
      audio.metadata.purchased_rental_licenses < purchasedRentalLicenseLimit
    ) {
      // Same pessimistic-lock auto-purchase pattern as rent (with the same
      // guarded rollback so we don't rollback an already-committed tx).
      const queryRunner =
        this.audioMetadataRepository.manager.connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // Flags set when the auto-purchase aborts cleanly under the lock. The
      // customer-facing throws run after release so the catch below doesn't
      // wrap them as the generic retry message.
      let metadataMissing = false;
      let allCopiesOnLoan = false;

      try {
        const lockedMetadata = await queryRunner.manager
          .createQueryBuilder(AudioMetadata, 'metadata')
          .setLock('pessimistic_write')
          .where('metadata.sku = :sku', { sku: audio.sku })
          .getOne();

        if (!lockedMetadata) {
          metadataMissing = true;
          this.logger.error(
            `audio_metadata row missing for sku=${audio.sku} during renew auto-purchase lock`,
          );
          await queryRunner.commitTransaction();
        } else if (
          lockedMetadata.purchased_rental_licenses >=
          purchasedRentalLicenseLimit
        ) {
          // Limit reached by a concurrent request — abort cleanly.
          allCopiesOnLoan = true;
          await queryRunner.commitTransaction();
        } else {
          await this.purchaseLicenseOfAudio(
            audio.sku,
            1,
            audio.metadata.product_id,
            audio.metadata.findaway_price,
            'US',
          );

          await queryRunner.manager.update(
            AudioMetadata,
            { sku: audio.sku },
            {
              purchased_rental_licenses:
                lockedMetadata.purchased_rental_licenses + 1,
            },
          );

          await queryRunner.commitTransaction();

          audio.metadata.purchased_rental_licenses =
            lockedMetadata.purchased_rental_licenses + 1;

          this.logger.log(
            `Auto-purchased license for audio ${audio.sku} during renew, new count: ${audio.metadata.purchased_rental_licenses}`,
          );
        }
      } catch (error: any) {
        if (queryRunner.isTransactionActive) {
          await queryRunner.rollbackTransaction();
        }
        this.logger.error(
          `Auto-purchase failed during renew for audio ${audio.sku}: ${error?.message}`,
          error?.stack || JSON.stringify(error),
        );
        throw new BadRequestException(
          'Unable to process rental at this time. Please try again.',
        );
      } finally {
        await queryRunner.release();
      }

      if (metadataMissing) {
        throw new BadRequestException(
          'This title is temporarily unavailable. Please talk to admin.',
        );
      }
      if (allCopiesOnLoan) {
        throw new BadRequestException(
          'All current copies of this title are on loan. Please check back later.',
        );
      }
    }

    // Headline fix: check in the user's existing Inaudio license BEFORE
    // issuing a new checkout, but only if Inaudio still has it on loan.
    // If Inaudio's loan_period already elapsed and the license was
    // auto-returned (local DB stale), skip the checkin silently and treat
    // the renew as a fresh rental.
    const previousExpireAt = userAudio.rental_expire_at;
    const previousCheckoutId: string | undefined =
      userAudio.meta?.inaudio_checkout_response?.checkout_id;

    let userLicenseStillOnLoan = false;
    if (previousCheckoutId && userAudio.license_id) {
      const inaudioAudioDetails: any = await this.audioEngineService.get(
        `/accounts/${this.audioEngineAccountId}/audiobooks/${audio.sku}`,
      );
      const inaudioLicenses: AudioFindawayworldLicense[] =
        inaudioAudioDetails?.licenses ?? [];
      const userInaudioLicense = inaudioLicenses.find(
        (l) => l.id === userAudio.license_id,
      );
      userLicenseStillOnLoan =
        !!userInaudioLicense &&
        userInaudioLicense.checkout_id === previousCheckoutId;
    }

    let checkinResponse: any = null;
    if (userLicenseStillOnLoan && previousCheckoutId) {
      try {
        checkinResponse = await this.checkInLicenseOfAudio(previousCheckoutId);
      } catch (error: any) {
        this.logger.error(
          `Inaudio checkin failed during renew for checkout_id=${previousCheckoutId} user_id=${user.id} sku=${audio.sku}: ${error?.message}`,
          error?.stack || JSON.stringify(error),
        );
        throw error;
      }
    } else if (previousCheckoutId) {
      // Inaudio already auto-returned this checkout (or reassigned the
      // license). Proceed silently as a fresh rental for the user.
      this.logger.warn(
        `Renew: Inaudio license_id=${userAudio.license_id} no longer on loan (local checkout_id=${previousCheckoutId}); proceeding silently as fresh rental for user_id=${user.id} audio_id=${audioId}.`,
      );
    } else {
      // Legacy row pre-dates meta.inaudio_checkout_response; treat as fresh.
      this.logger.warn(
        `Renewing audio_id=${audioId} for user_id=${user.id} without a stored Inaudio checkout_id; treating as fresh rental.`,
      );
    }

    let newRentalExpireAt: Date;
    let loanPeriodMinutes: number;
    if (userLicenseStillOnLoan && previousExpireAt) {
      // Extend from the previous expiry — preserve any unused loan period.
      const remainingTimeInMinutes = Math.max(
        0,
        Math.floor((previousExpireAt.getTime() - Date.now()) / (1000 * 60)),
      );
      newRentalExpireAt = new Date(
        previousExpireAt.getTime() + rentalPeriodInDays * 24 * 60 * 60 * 1000,
      );
      loanPeriodMinutes = rentalPeriodInDays * 1440 + remainingTimeInMinutes;
    } else {
      // Fresh-rental semantics: start the clock now (matches rent behavior).
      newRentalExpireAt = new Date(
        Date.now() + rentalPeriodInDays * 24 * 60 * 60 * 1000,
      );
      loanPeriodMinutes = rentalPeriodInDays * 1440;
    }

    const license = await this.getLicenseForCheckoutToRentAudio(audio.sku);
    const checkout = await this.checkoutLicenseOfAudio(
      audio,
      license,
      loanPeriodMinutes,
    );

    userAudio.rental_expire_at = newRentalExpireAt;
    userAudio.license_id = checkout.license_id;
    userAudio.updated_at = new Date();
    userAudio.meta = {
      ...(userAudio.meta || {}),
      ...(checkinResponse ? { inaudio_checkin_response: checkinResponse } : {}),
      inaudio_checkout_response: checkout,
    };

    try {
      await Promise.all([
        this.userAudioStatusRepository.save(userAudio),
        // NOTE: no total_rented bump. The same user is holding the same copy;
        // rent already counted it and return decrements it once. Bumping here
        // would leave total_rented +1 stuck for every rent→renew→return.
        this.storeUserActivityLog(user, audio, USER_ACTIVITY.RENEW, {
          credit_used: rentalCreditCost,
          // start_time = when the new period begins. For an "extend" renew
          // that's the old expiry; for the silent fresh-rental path it's now.
          start_time: userLicenseStillOnLoan
            ? previousExpireAt
            : userAudio.updated_at,
          end_time: newRentalExpireAt,
          inaudio_license_id: checkout.license_id,
        }),
      ]);
    } catch (error: any) {
      // Inaudio already accepted the checkin + new checkout — surface the
      // mismatch for ops to reconcile.
      this.logger.error(
        `Inaudio checkout succeeded but local persistence failed during renew. sku=${audio.sku} license_id=${checkout.license_id} user_id=${user.id}: ${error?.message}`,
        error?.stack || JSON.stringify(error),
      );
      throw error;
    }

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

    if (
      userAudio.rental_expire_at &&
      userAudio.rental_expire_at <= new Date()
    ) {
      throw new BadRequestException(
        `The audio book with ID ${audioId} is already returned.`,
      );
    }

    const checkoutId: string | undefined =
      userAudio.meta?.inaudio_checkout_response?.checkout_id;
    let checkinResponse: any = null;

    if (checkoutId) {
      try {
        checkinResponse = await this.checkInLicenseOfAudio(checkoutId);
      } catch (error: any) {
        this.logger.error(
          `Inaudio checkin failed for checkout_id=${checkoutId} user_id=${user.id}: ${error?.message}`,
          error?.stack,
        );
        throw error;
      }
    } else {
      // Legacy rows pre-date `meta.inaudio_checkout_response`; nothing to call.
      this.logger.warn(
        `Returning audio_id=${audioId} for user_id=${user.id} without a stored Inaudio checkout_id; local state only.`,
      );
    }

    userAudio.rental_expire_at = new Date();
    userAudio.license_id = null;
    if (checkinResponse) {
      userAudio.meta = {
        ...(userAudio.meta || {}),
        inaudio_checkin_response: checkinResponse,
      };
    }

    const activity = await this.userActivityLogRepository.findOne({
      where: {
        user_id: user.id,
        item_type: MEDIA.AUDIO,
        item_id: audioId,
        action: In([USER_ACTIVITY.RENT, USER_ACTIVITY.RENEW]),
      },
      order: { created_at: 'DESC' },
    });

    if (activity) {
      activity.meta = {
        ...activity.meta,
        end_time: userAudio.rental_expire_at,
      };
    }

    const [updatedUserAudio] = await Promise.all([
      this.userAudioStatusRepository.save(userAudio),
      activity
        ? this.userActivityLogRepository.save(activity)
        : Promise.resolve(),
      this.audioRepository
        .createQueryBuilder()
        .update(Audio)
        .set({ total_rented: () => 'GREATEST(total_rented - 1, 0)' })
        .where('id = :id', { id: audioId })
        .execute(),
    ]);

    await this.audioElasticsearchSyncService.syncAudioById(audioId);

    return updatedUserAudio;
  }
}
