import { Expose, Type } from 'class-transformer';
import { PaginationMeta } from 'src/common/interfaces';

/**
 * One recommended audio row for the admin table.
 *
 * Fields are flat & pre-resolved by the service — no @Transform fallback
 * chains. The service query hits `audio_metadata` directly and shapes the
 * plain object before passing to plainToInstance, so class-transformer only
 * has to enforce exposure/exclusion, not derive values.
 */
export class RecommendedActiveAudioDto {
  @Expose()
  rank: number;

  @Expose()
  sku: string;

  @Expose()
  title: string | null;

  @Expose()
  authors: string[];

  @Expose()
  image_url: string | null;

  @Expose()
  ai_similarity_score: number;

  @Expose()
  computed_at: Date;
}

/**
 * Standard admin-panel pagination envelope: `{ data, meta, ... }`.
 * Reuses the project-wide `PaginationMeta` from src/common/interfaces
 * (also used by AudioService, VideoService, NotificationService, etc.)
 * so the shared frontend <Pagination> component just works.
 *
 * NOTE the `@Type()` on `data` — required for class-transformer to
 * transform each item under `excludeExtraneousValues: true`. Without it,
 * nested transforms silently drop fields.
 */
export class RecommendedActiveAudiosPageDto {
  @Expose()
  @Type(() => RecommendedActiveAudioDto)
  data: RecommendedActiveAudioDto[];

  @Expose()
  meta: PaginationMeta;

  @Expose()
  batch_id: string | null;

  @Expose()
  computed_at: Date | null;
}

export class AiActiveRecommendationStatusDto {
  @Expose()
  status: 'idle' | 'pending' | 'running' | 'success' | 'failed';

  @Expose()
  stage: string | null;

  @Expose()
  triggered_by: string | null;

  @Expose()
  started_at: Date | null;

  @Expose()
  completed_at: Date | null;

  @Expose()
  rows_produced: number | null;

  @Expose()
  error_message: string | null;

  @Expose()
  batch_id: string | null;

  @Expose()
  interval_days: number;

  @Expose()
  next_scheduled_at: Date | null;
}
