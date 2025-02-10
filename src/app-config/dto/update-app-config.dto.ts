import { IsNumber, IsString, Min } from 'class-validator';

export class UpdateAppConfigDto {
  @IsNumber()
  @Min(0)
  audio_rental_period_in_days: number;

  @IsNumber()
  @Min(0)
  audio_rental_credit_cost: number;

  @IsNumber()
  @Min(0)
  video_rental_credit_cost: number;

  @IsNumber()
  @Min(0)
  pharma_rental_credit_cost: number;

  @IsNumber()
  @Min(0)
  max_audio_rental_items_per_day: number;

  @IsNumber()
  @Min(0)
  max_audio_rental_items_on_hand: number;

  @IsNumber()
  @Min(0)
  notification_for_rent_expiring_in_d1_days: number;

  @IsNumber()
  @Min(0)
  notification_for_rent_expiring_in_d2_days: number;

  @IsNumber()
  @Min(0)
  notification_for_noactivity_in_last_x_days: number;

  @IsString()
  new_user_default_password: string;
}
