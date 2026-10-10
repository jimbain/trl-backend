import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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
  // Capped: this is the row count written per batch to
  // ai_recommended_active_audios, which has no retention.
  @Max(10000)
  ai_recommendation_top_n: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : parseInt(value, 10),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  // Capped hard. rank_candidates builds a (candidates x active) float32 matrix
  // plus an np.partition copy; at the default 50 that is already ~722 MB on a
  // pool of 95,000 against 1,913 active titles. The Configuration page invites
  // raising it ("larger values improve coverage"), and a four-figure value
  // would make the pool the whole inactive catalogue and OOM the 8 GB box that
  // also serves the API.
  @Max(500)
  ai_recommendation_top_k_per_active: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : parseInt(value, 10),
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  popularity_interval_days: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : Number(value),
  )
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  popularity_source_weight_openlibrary: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : Number(value),
  )
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  popularity_source_weight_google: number;

  @Transform(({ value }) =>
    value === '' || value === null || value === undefined
      ? undefined
      : parseInt(value, 10),
  )
  @IsOptional()
  @IsInt()
  @Min(0)
  // Two sources exist (Open Library, Google Books), so confidence is 0, 1 or 2.
  // The previous @Max(3) let an admin set a threshold that hides every row.
  @Max(2)
  popularity_min_confidence_display: number;
}
