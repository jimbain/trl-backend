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

export class QueryAdminPharmaDto {
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  per_page?: number;

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
  order_by_column?:
    | 'sku'
    | 'is_active'
    | 'is_featured'
    | 'title'
    | 'created_at';

  @IsOptional()
  @Transform(({ value }) => value?.toUpperCase())
  @IsEnum(OrderBy)
  order_by?: OrderBy;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_export?: boolean;
}
