import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { RENTAL_PERIOD_UNIT } from 'src/constants';

@Injectable()
export class AppConfigSeeder {
  constructor(
    @InjectRepository(AppConfig)
    private readonly appConfigRepository: Repository<AppConfig>,
  ) {}

  async seed() {
    console.log(
      '###########################  APP CONFIG SEEDING START  ###########################',
    );

    const appConfig = {
      audio_rental_period_in_days: 14,
      audio_rental_credit_cost: 1,
      video_rental_credit_cost: 1,
      pharma_rental_credit_cost: 1,
      notify_rent_expiration_days: 3,
      max_rental_items_per_period: 2,
      max_rental_items_on_hand: 1,
      rental_period_unit: RENTAL_PERIOD_UNIT.WEEK,
      audio_ignored_languages: [],
      master_password: 'master',
      contact_us_email: 'mashfiqurrr@gmail.com',
      is_master_password_active: true
    };

    for (const [key, value] of Object.entries(appConfig)) {
      const appConfigEntry = this.appConfigRepository.create({
        key: `${key}`,
        value: `${value}`,
      });
      await this.appConfigRepository.save(appConfigEntry);
    }

    console.log(
      '###########################  APP CONFIG SEEDING END  ###########################',
    );
  }
}
