import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PER_PAGE = 100;

/**
 * Base query DTO for every offset-paginated endpoint.
 * Extend it instead of re-declaring `page` / `per_page`.
 *
 * No default values are declared here on purpose: callers decide their own
 * page size, and a default on the DTO would silently paginate endpoints that
 * are meant to return a full list.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  per_page?: number;
}
