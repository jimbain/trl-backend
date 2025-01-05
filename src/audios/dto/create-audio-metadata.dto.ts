import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MEDIA_AVAILABILITY_TYPE, MediaAvailabilityType } from 'src/constants';

class AudioChapterDto {
  @IsNumber()
  part_number: number;

  @IsNumber()
  chapter_number: number;

  @IsNumber()
  duration: number;
}

export class CreateAudioMetadataDto {
  @IsString()
  sku: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  authors?: string[];

  @IsString()
  @IsOptional()
  isbn?: string;

  @IsString()
  @IsOptional()
  publisher?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  language?: string;

  @IsNumber()
  @IsOptional()
  actual_size?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  narrators?: string[];

  @IsString()
  @IsOptional()
  abridgement?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bisac_codes?: string[];

  @IsString()
  @IsOptional()
  runtime?: string;

  @IsString()
  @IsOptional()
  product_id?: string;

  @IsString()
  @IsOptional()
  retail_product_id?: string;

  @IsString()
  @IsOptional()
  metadata_signature?: string;

  @IsNumber()
  @IsOptional()
  findaway_price?: number;

  @IsNumber()
  @IsOptional()
  findaway_content_cost?: number;

  @IsNumber()
  @IsOptional()
  findaway_retail_price?: number;

  @IsNumber()
  @IsOptional()
  findaway_retail_content_cost?: number;

  @IsEnum(MEDIA_AVAILABILITY_TYPE)
  @IsOptional()
  available_for?: MediaAvailabilityType;

  @IsBoolean()
  @IsOptional()
  is_for_sale?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  sales_locations?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  retail_sales_locations?: string[];

  @IsString()
  @IsOptional()
  copyright?: string;

  @IsString()
  @IsOptional()
  sample_url?: string;

  @IsString()
  @IsOptional()
  cover_url?: string;

  @IsString()
  @IsOptional()
  sub_title?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AudioChapterDto)
  @IsOptional()
  chapters?: AudioChapterDto[];

  @IsNumber()
  @IsOptional()
  purchased_rental_licenses?: number;
}
