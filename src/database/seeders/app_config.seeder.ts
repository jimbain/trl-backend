import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from 'src/app-config/entities/app-config.entity';

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
      max_audio_rental_items_per_day: 3,
      max_audio_rental_items_on_hand: 2,
      max_audio_purchase_per_day: 2,
      notification_for_rent_expiring_in_d1_days: 4,
      notification_for_rent_expiring_in_d2_days: 2,
      notification_for_noactivity_in_last_x_days: 30,
      notification_for_new_audio_expiring_in_d_days: 1,
      new_user_default_password: 'TRL@2025!@',
      available_audio_title_user_action: 'both',
      ai_recommendation_interval_days: 30,
      ai_recommendation_top_n: 1000,
      ai_recommendation_top_k_per_active: 50,
      popularity_interval_days: 1,
      popularity_source_weight_openlibrary: 1,
      popularity_min_confidence_display: 1,
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
