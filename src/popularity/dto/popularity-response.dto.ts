import { Expose, Type } from 'class-transformer';
import { PaginationMeta } from 'src/common/interfaces';

/**
 * Flat, pre-resolved item DTO. No @Transform fallback chains — the service
 * queries `audio_metadata` directly and shapes the plain object before
 * plainToInstance, so class-transformer only enforces exposure.
 */
export class PopularityAudioDto {
  @Expose()
  sku: string;

  @Expose()
  title: string | null;

  @Expose()
  authors: string[];

  @Expose()
  image_url: string | null;

  @Expose()
  popularity_score: number | null;

  @Expose()
  confidence: number;

  @Expose()
  sources: Record<string, unknown>;

  @Expose()
  computed_at: Date;
}

/**
 * Project-wide `{ data, meta }` pagination envelope. `meta` matches
 * `PaginationMeta` from src/common/interfaces so the shared frontend
 * <Pagination> component just works.
 *
 * `@Type()` on the array is mandatory under excludeExtraneousValues:true —
 * without it class-transformer silently drops nested item fields.
 */
export class PopularityListDto {
  @Expose()
  @Type(() => PopularityAudioDto)
  data: PopularityAudioDto[];

  @Expose()
  meta: PaginationMeta;

  @Expose()
  batch_id: string | null;

  @Expose()
  computed_at: Date | null;
}

export class PopularityStatusDto {
  @Expose()
  status:
    | 'idle'
    | 'pending'
    | 'running'
    | 'success'
    /** Completed, but a configured source matched nothing at all. */
    | 'partial'
    | 'failed';

  @Expose()
  stage: string | null;

  @Expose()
  triggered_by: string | null;

  @Expose()
  started_at: Date | null;

  @Expose()
  completed_at: Date | null;

  @Expose()
  audios_processed: number | null;

  @Expose()
  audios_matched: number | null;

  /** Rows matched per source, e.g. `{ openlibrary: 889 }`. */
  @Expose()
  source_match_counts: Record<string, number> | null;

  @Expose()
  error_message: string | null;

  @Expose()
  batch_id: string | null;

  @Expose()
  interval_days: number;

  @Expose()
  next_scheduled_at: Date | null;

  @Expose()
  weights: Record<string, number>;

  @Expose()
  min_confidence_display: number;
}
