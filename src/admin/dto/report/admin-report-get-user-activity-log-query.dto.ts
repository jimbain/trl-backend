import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { Media, MEDIA } from 'src/constants';

export class AdminReportGetUserActivityLogsQueryDto {
  @IsOptional()
  @IsDateString()
  created_at_from?: string;

  @IsOptional()
  @IsDateString()
  created_at_to?: string;

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
  company_ids?: string[];

  @IsOptional()
  @IsEnum(MEDIA)
  item_type?: Media;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  user_ids?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ obj }) => obj?.is_export === 'true')
  is_export?: boolean;
}
