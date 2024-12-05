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
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { Company } from 'src/companies/entities/company.entity';
import { AudioEngineService } from 'src/common/services/audio_engine.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class UserAudioService {
  constructor(
    @InjectRepository(UserAudioStatus)
    private readonly userAudioStatusRepository: Repository<UserAudioStatus>,

    @InjectRepository(Audio)
    private readonly audioRepository: Repository<Audio>,

    @InjectRepository(UserActivityLog)
    private readonly userActivityLogRepository: Repository<UserActivityLog>,

    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,

    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    private readonly audioEngineService: AudioEngineService,
    private readonly configService: ConfigService,
  ) {}

  async update(
    audioId: string,
    status: 'queued' | 'rented' | 'bookshelved',
    user: User,
  ) {
    const audioEngineAccountId = this.configService.getOrThrow<string>(
      'AUDIO_ENGINE_ACCOUNT_ID',
    );

    const [audio, audioRentalCost, userAudio] = await Promise.all([
      this.audioRepository.findOne({ where: { id: audioId } }),
      this.appConfigRepository.findOne({
        select: ['value'],
        where: { key: 'audio_rental_credit_cost' },
      }),
      this.userAudioStatusRepository.findOne({
        where: { audio_id: audioId, user_id: user.id },
      }),
    ]);

    if (!audio) {
      throw new NotFoundException(`Audio with ID ${audioId} not found`);
    }

    if (
      (status === 'bookshelved' || status === 'rented') &&
      audio.total_rented >= audio.purchased_licenses
    ) {
      throw new BadRequestException(
        `There is no purchased license for this audio book. Please talk to admin.`,
      );
    }

    if (userAudio && userAudio.status === status) {
      throw new BadRequestException(`Status unchanged`);
    }

    let rentalExpiresAt = null;
    if (status === 'rented') {
      const rentalPeriodInDays = await this.appConfigRepository.findOne({
        select: ['value'],
        where: { key: 'audio_rental_period_in_days' },
      });

      rentalExpiresAt =
        status === 'rented'
          ? new Date(
              new Date().setDate(
                new Date().getDate() + parseInt(rentalPeriodInDays.value),
              ),
            )
          : null;
    }

    const updatedUserAudio = userAudio
      ? {
          ...userAudio,
          status,
          updated_at: new Date(),
          rental_expire_at: rentalExpiresAt,
          license_id: null,
        }
      : this.userAudioStatusRepository.create({
          audio_id: audioId,
          user_id: user.id,
          status,
          updated_at: new Date(),
          rental_expire_at: rentalExpiresAt,
          license_id: null,
        });

    if (status === 'bookshelved' || status === 'rented') {
      // const sku = audio.sku;
      const sku = '00037';
      const data: any = await this.audioEngineService.get(
        `/accounts/${audioEngineAccountId}/audiobooks/${sku}`,
      );
      const license: { id: any; checkout_id: any } =
        this.findLicenseWithNullCheckoutId(data?.licenses ?? null);
      const checkout = await this.checkoutLicenseOfAudio(sku, license);
      updatedUserAudio.license_id = checkout.checkout.license_id;
    }

    await this.userAudioStatusRepository.save(updatedUserAudio);

    const actionMapping = {
      queued: { action_type: 'queue', credit_used: 0 },
      rented: {
        action_type: 'rent',
        credit_used: parseInt(audioRentalCost?.value.toString() || '0', 10),
      },
      bookshelved: { action_type: 'keep', credit_used: audio.trl_cost || 0 },
    };

    const { action_type, credit_used } = actionMapping[status];

    // Log user activity
    const userActivityLog = this.userActivityLogRepository.create({
      user_id: user.id,
      item_id: audioId,
      item_type: 'audio',
      action_type,
      credit_used,
    });

    await this.userActivityLogRepository.save(userActivityLog);

    // Deduct credits if applicable
    if (credit_used > 0) {
      const company = await this.companyRepository.findOne({
        select: ['available_credits'],
        where: { id: user.company_id },
      });

      if (!company) {
        throw new NotFoundException(
          `Company with ID ${user.company_id} not found`,
        );
      }

      if (company.available_credits >= credit_used) {
        await this.companyRepository.decrement(
          { id: user.company_id },
          'available_credits',
          credit_used,
        );
      } else {
        throw new BadRequestException(
          `Insufficient credits. Available credits: ${company.available_credits}`,
        );
      }
    }

    return this.userAudioStatusRepository.findOne({
      where: { audio_id: audioId, user_id: user.id },
    });
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

  async renewRentedAudio(
    audioId: string,
    user: User,
  ){
    const [rentalPeriodConfig, userAudio] = await Promise.all([
      this.appConfigRepository.findOne({
        select: ['value'],
        where: { key: 'audio_rental_period_in_days' },
      }),
      this.userAudioStatusRepository.findOne({
        where: {
          audio_id: audioId,
          user_id: user.id,
          status: 'rented',
        },
      }),
    ]);

    if( ! userAudio ){
      throw new BadRequestException(
        `The audio book with ID ${audioId} doesn't exist in your rented list.`,
      );
    }

    const rentalPeriodInDays = rentalPeriodConfig
      ? parseInt(rentalPeriodConfig.value, 10)
      : 14;

    const newRentalExpireAt = userAudio.rental_expire_at
      ? new Date(userAudio.rental_expire_at.getTime() + rentalPeriodInDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + rentalPeriodInDays * 24 * 60 * 60 * 1000);

    userAudio.rental_expire_at = newRentalExpireAt;
    return await this.userAudioStatusRepository.save(userAudio);
  }
}
