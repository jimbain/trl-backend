import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  new_user_default_password: string;

  @IsString()
  @IsIn(['both', 'rent', 'bookshelf'])
  @IsOptional()
  available_audio_title_user_action: string;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : parseInt(value, 10),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  ai_recommendation_interval_days: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : parseInt(value, 10),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  ai_recommendation_top_n: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : parseInt(value, 10),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  ai_recommendation_top_k_per_active: number;
}
