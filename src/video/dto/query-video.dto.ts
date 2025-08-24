import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class QueryVideoDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  per_page?: number;

  @IsOptional()
  @IsString()
  category_id?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_included_in_category?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  category_ids?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_featured?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: 'queued' | 'rented';

  @IsOptional()
  @IsString()
  sort_by?: 'title' | 'created_at' | 'updated_at';

  @IsOptional()
  @IsString()
  sort_order?: 'asc' | 'desc';

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  popular?: boolean;

  @IsOptional()
  @IsString()
  avilar_course_id?: string;

  @IsOptional()
  @IsString()
  group?: string;
}
