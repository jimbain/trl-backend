import { Transform } from 'class-transformer';
import { IsInt, IsNumber, IsString, Min } from 'class-validator';

export class UpdateAppConfigDto {
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  audio_rental_period_in_days: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  audio_rental_credit_cost: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  video_rental_credit_cost: number;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0)
  pharma_rental_credit_cost: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  max_audio_rental_items_per_day: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  max_audio_rental_items_on_hand: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  max_audio_purchase_per_day: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  notification_for_rent_expiring_in_d1_days: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  notification_for_rent_expiring_in_d2_days: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  notification_for_noactivity_in_last_x_days: number;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  notification_for_new_audio_expiring_in_d_days: number;
}
