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
    private readonly appConfigService: AppConfigService,
    private readonly audioEngineService: AudioEngineService,
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

  async storeUserActivityLog(
    user: User,
    audio: Audio,
    action: 'queue' | 'rent' | 'keep',
    credit: number = 0,
  ) {
    const userActivityLog = this.userActivityLogRepository.create({
      user_id: user.id,
      item_id: audio.id,
      item_type: 'audio',
      action_type: action,
      credit_used: credit,
    });

    await this.userActivityLogRepository.save(userActivityLog);

    if (credit === 0) {
      return;
    }

    const company = await this.companyRepository.findOne({
      select: ['available_credits'],
      where: { id: user.company_id },
    });

    if (!company) {
      throw new NotFoundException(
        `Company with ID ${user.company_id} not found`,
      );
    }

    if (company.available_credits >= credit) {
      await this.companyRepository.decrement(
        { id: user.company_id },
        'available_credits',
        credit,
      );
    } else {
      throw new BadRequestException(
        `Insufficient credits. Available credits: ${company.available_credits}`,
      );
    }
  }

  async queueAudio(audioId: string, user: User) {
    const [audio, userAudio] = await Promise.all([
      this.audioService.findById(audioId),
      this.userAudioStatusRepository.findOne({
        where: {
          audio_id: audioId,
          user_id: user.id,
        },
      }),
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
      updated_at: new Date(),
    });

    await this.storeUserActivityLog(user, audio, 'queue', 0);
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

    await this.userAudioStatusRepository.remove(queuedAudio);

    return {
      message: `The audio book with ID ${audioId} has been removed from your queued list.`,
    };
  }

  async rentAudio(audioId: string, user: User) {
    const appConfigs = await this.appConfigService.getAppConfigs([
      'audio_rental_credit_cost',
      'audio_rental_period_in_days',
      'max_audio_rental_items_on_hand',
      'rental_period_in_hours',
      'max_audio_rental_items_per_period',
    ]);

    const rentalPeriodInHours = parseInt(
      appConfigs['rental_period_in_hours'],
      10,
    );
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

    const updatedUserAudio = userAudio
      ? {
          ...userAudio,
          status: 'rented',
          updated_at: new Date(),
          rental_expire_at: rentalExpiresAt,
          license_id: null,
        }
      : this.userAudioStatusRepository.create({
          audio_id: audioId,
          user_id: user.id,
          status: 'rented',
          updated_at: new Date(),
          rental_expire_at: rentalExpiresAt,
          license_id: null,
        });

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
      this.storeUserActivityLog(
        user,
        audio,
        'rent',
        parseInt(appConfigs['audio_rental_credit_cost'], 10) ?? 1,
      ),
    ]);

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async bookselfAudio(audioId: string, user: User) {
    const [audio, userAudio] = await Promise.all([
      this.audioService.findById(audioId, ['metadata']),
      this.userAudioStatusRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      }),
    ]);

    if (userAudio && userAudio.status === 'bookshelved') {
      throw new BadRequestException(`Status unchanged`);
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

    const updatedUserAudio = userAudio
      ? {
          ...userAudio,
          status: 'bookshelved',
          updated_at: new Date(),
          rental_expire_at: null,
          license_id: null,
        }
      : this.userAudioStatusRepository.create({
          audio_id: audioId,
          user_id: user.id,
          status: 'bookshelved',
          updated_at: new Date(),
          rental_expire_at: null,
          license_id: null,
        });

    const license = licenses[0];
    updatedUserAudio.license_id = license.id;

    await this.userAudioStatusRepository.save(updatedUserAudio);
    await this.storeUserActivityLog(
      user,
      audio,
      'keep',
      audio.bookshelf_credit_cost || 0,
    );

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async renewRentedAudio(audioId: string, user: User) {
    const [audio, appConfigs, userAudio] = await Promise.all([
      this.audioService.findById(audioId, ['metadata']),
      this.appConfigService.getAppConfigs([
        'audio_rental_period_in_days',
        'audio_rental_credit_cost',
      ]),
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
      this.storeUserActivityLog(
        user,
        audio,
        'rent',
        parseInt(appConfigs['audio_rental_credit_cost'], 10) ?? 1,
      ),
    ]);

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
    return this.userAudioStatusRepository.save(userAudio);
  }
}
