import { Expose, Transform } from 'class-transformer';

export class RecommendedActiveAudioDto {
  @Expose()
  rank: number;

  @Expose()
  sku: string;

  @Expose()
  @Transform(({ obj }) => obj.display_title ?? obj?.metadata?.title ?? null)
  title: string | null;

  @Expose()
  @Transform(({ obj }) => obj.display_authors ?? obj?.metadata?.authors ?? [])
  authors: string[];

  @Expose()
  @Transform(({ obj }) => obj?.metadata?.cover_url ?? null)
  image_url: string | null;

  @Expose()
  avg_rating: number;

  @Expose()
  ai_similarity_score: number;

  @Expose()
  computed_at: Date;
}

export class RecommendedActiveAudiosPageDto {
  @Expose()
  items: RecommendedActiveAudioDto[];

  @Expose()
  page: number;

  @Expose()
  limit: number;

  @Expose()
  total: number;

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
