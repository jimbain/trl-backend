import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsArray,
  IsEnum,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum SearchFor {
  PHRASE = 'phrase',
  ALL_WORDS = 'all_words',
  ANY_WORD = 'any_word',
}

export enum OrderBy {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryAdminVideoDto {
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
  is_active?: boolean;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : null))
  search_text?: string;

  @IsOptional()
  @IsEnum(SearchFor)
  search_for?: SearchFor;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_searching_whole_word?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_featured?: boolean;

  @IsOptional()
  @IsString()
  avilar_course_id?: string;

  @IsOptional()
  @IsString()
  group?: string;

  @IsOptional()
  @IsString()
  order_by_column?:
    | 'sku'
    | 'is_active'
    | 'is_featured'
    | 'title'
    | 'created_at'
    | 'avilar_course_id'
    | 'group';

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsEnum(OrderBy)
  order_by?: OrderBy;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_export?: boolean;
}
