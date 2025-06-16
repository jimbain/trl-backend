import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsValidDateFormat } from 'src/validation/validators/is-valid-date-format.validator';

export enum SearchFor {
  PHRASE = 'phrase',
  ALL_WORDS = 'all_words',
  ANY_WORD = 'any_word',
}

export enum OrderBy {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryAdminAudioDto {
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
  @IsValidDateFormat()
  street_date_from?: string;

  @IsOptional()
  @IsValidDateFormat()
  street_date_to?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  bookshelf_credit_cost?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  retail_price_min?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  retail_price_max?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  retail_content_cost_min?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  retail_content_cost_max?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_featured?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_excluded?: boolean;

  @IsOptional()
  @IsString()
  order_by_column?:
    | 'sku'
    | 'title'
    | 'author'
    | 'publisher'
    | 'language'
    | 'bookshelf_credit_cost';

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsEnum(OrderBy)
  order_by?: OrderBy;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_export?: boolean;
}
