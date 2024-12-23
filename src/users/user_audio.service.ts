import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { Audio } from 'src/audios/entities/audio.entity';
import { UserAudioStatus } from './entities/user_audio_status.entity';
import { UserActivityLog } from './entities/user_activity_log.entity';
import { Company } from 'src/companies/entities/company.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { ConfigService } from '@nestjs/config';
import { AppConfigService } from 'src/app-config/app-config.service';
import { AudioService } from 'src/audios/audio.service';

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

  findLicenseWithNullCheckoutId(
    licenses: { id: any; checkout_id: any }[] | undefined | null,
  ) {
    if (!licenses) {
      throw new BadRequestException(
        `There is no available licenses for this audio book.`,
      );
    }

    const license =
      licenses.find((license) => license.checkout_id === null) || null;

    if (!license) {
      throw new BadRequestException(
        `There is no available license for checkout the audio book.`,
      );
    }

    return license;
  }

  async checkoutLicenseOfAudio(
    audioId: string,
    license: { id: any; checkout_id: any },
  ) {
    const data: any = await this.audioEngineService.post(
      `/audiobooks/${audioId}/checkout`,
      {
        license_id: license.id,
        external_listener_id: this.configService.getOrThrow<string>(
          'AUDIO_ENGINE_EXTERNAL_LISTENER_ID',
        ),
        loan_period_minutes: 1500,
      },
    );

    if (data.checkout.license_id !== license.id) {
      throw new BadRequestException(`Invalid license`);
    }

    return data;
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
    const [audio, appConfigs, userAudio, rentedAudioCount] = await Promise.all([
      this.audioService.findById(audioId),
      this.appConfigService.getAppConfigs([
        'audio_rental_credit_cost',
        'audio_rental_period_in_days',
        'max_rental_items_on_hand',
        'rental_period_unit',
      ]),
      this.userAudioStatusRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      }),
      this.userAudioStatusRepository.count({
        where: { user_id: user.id, status: 'rented' },
      }),
    ]);

    if (audio.total_rented >= audio.purchased_licenses) {
      throw new BadRequestException(
        `There is no purchased license for this audio book. Please talk to admin.`,
      );
    }

    const maxRentalItemsOnHand =
      parseInt(appConfigs.max_rental_items_on_hand?.toString()) ?? 1;

    if (rentedAudioCount >= maxRentalItemsOnHand) {
      throw new BadRequestException(
        `You are allowed to rent ${maxRentalItemsOnHand} item(s) per ${appConfigs?.rental_period_unit ?? ''}.`,
      );
    }

    if (userAudio && userAudio.status === 'rented') {
      throw new BadRequestException(`Status unchanged`);
    }

    const rentalPeriodInDays = appConfigs.audio_rental_period_in_days
      ? parseInt(appConfigs.audio_rental_period_in_days, 10)
      : 14;

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

    const sku = audio.sku;
    const data: any = await this.audioEngineService.get(
      `/accounts/${this.audioEngineAccountId}/audiobooks/${sku}`,
    );
    const license: { id: any; checkout_id: any } =
      this.findLicenseWithNullCheckoutId(data?.licenses ?? null);
    const checkout = await this.checkoutLicenseOfAudio(sku, license);
    updatedUserAudio.license_id = checkout.checkout.license_id;

    await this.audioRepository.update(
      { id: audioId },
      { total_rented: (audio.total_rented || 0) + 1 },
    );

    await this.userAudioStatusRepository.save(updatedUserAudio);
    await this.storeUserActivityLog(
      user,
      audio,
      'rent',
      parseInt(appConfigs.audio_rental_credit_cost?.toString() || '0', 10) ?? 1,
    );

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async bookselfAudio(audioId: string, user: User) {
    const [audio, userAudio] = await Promise.all([
      this.audioService.findById(audioId),
      this.userAudioStatusRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      }),
    ]);

    if (userAudio && userAudio.status === 'bookshelved') {
      throw new BadRequestException(`Status unchanged`);
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

    const sku = audio.sku;
    const data: any = await this.audioEngineService.get(
      `/accounts/${this.audioEngineAccountId}/audiobooks/${sku}`,
    );
    const license: { id: any; checkout_id: any } =
      this.findLicenseWithNullCheckoutId(data?.licenses ?? null);
    const checkout = await this.checkoutLicenseOfAudio(sku, license);
    updatedUserAudio.license_id = checkout.checkout.license_id;

    await this.audioRepository.update(
      { id: audioId },
      { total_rented: (audio.total_rented || 0) + 1 },
    );

    await this.userAudioStatusRepository.save(updatedUserAudio);
    await this.storeUserActivityLog(user, audio, 'keep', audio.trl_cost || 0);

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
  }

  async renewRentedAudio(audioId: string, user: User) {
    const [appConfigs, userAudio] = await Promise.all([
      this.appConfigService.getAppConfigs(['audio_rental_period_in_days']),
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

    const rentalPeriodInDays = appConfigs.audio_rental_period_in_days
      ? parseInt(appConfigs.audio_rental_period_in_days, 10)
      : 14;

    if (userAudio.rental_expire_at) {
      const currentTime = new Date();
      const rentalExpiredAt = new Date(userAudio.rental_expire_at);

      const timeDifferenceInDays =
        (rentalExpiredAt.getTime() - currentTime.getTime()) /
        (1000 * 60 * 60 * 24);

      if (timeDifferenceInDays > 4) {
        throw new BadRequestException(
          `The audio book with ID ${audioId} will not be available for renewal.`,
        );
      }
    }

    const newRentalExpireAt = userAudio.rental_expire_at
      ? new Date(
          userAudio.rental_expire_at.getTime() +
            rentalPeriodInDays * 24 * 60 * 60 * 1000,
        )
      : new Date(Date.now() + rentalPeriodInDays * 24 * 60 * 60 * 1000);

    userAudio.rental_expire_at = newRentalExpireAt;
    return this.userAudioStatusRepository.save(userAudio);
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
