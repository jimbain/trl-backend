import { Expose, Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationMeta } from 'src/common/interfaces';

/**
 * One row of the Active-Based List run log.
 *
 * Mirrors `ai_recommendation_runs` as-is rather than summarising it: this view
 * exists so an admin can see *why* a run failed, and `error_message` is the
 * whole point. Twenty-four consecutive failures accumulated unnoticed because
 * this table had no surface anywhere in the product.
 */
export class AiRecommendationRunDto {
  @Expose()
  id: string;

  @Expose()
  batch_id: string;

  @Expose()
  status: 'pending' | 'running' | 'success' | 'failed';

  @Expose()
  stage: string | null;

  @Expose()
  triggered_by: string;

  @Expose()
  started_at: Date;

  @Expose()
  completed_at: Date | null;

  @Expose()
  rows_produced: number | null;

  @Expose()
  error_message: string | null;
}

/** Standard `{ data, meta }` envelope so the shared <Pagination> just works. */
export class AiRecommendationRunsPageDto {
  @Expose()
  @Type(() => AiRecommendationRunDto)
  data: AiRecommendationRunDto[];

  @Expose()
  meta: PaginationMeta;
}

export class ListAiRecommendationRunsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  per_page: number = 20;
}
