import {
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsArray,
  IsString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Media, MEDIA } from 'src/constants';

export class AdminQueuedTitlesQueryDto {
  @IsEnum(MEDIA)
  media_type: Media;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  company_ids?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  per_page?: number = 20;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  user_ids?: string[];

  @IsOptional()
  @IsString()
  search?: string; // Search by user name, email, or title

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'queued_at_from must be in Y-m-d format (e.g., 2024-12-20)',
  })
  queued_at_from?: string; // Date in Y-m-d format

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'queued_at_to must be in Y-m-d format (e.g., 2024-12-20)',
  })
  queued_at_to?: string; // Date in Y-m-d format
}
