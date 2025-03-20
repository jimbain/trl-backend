import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsArray,
} from 'class-validator';

export class AdminUpdateAudioDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  display_title?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  display_description?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  display_short_description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    const transformedArray = value
      .map((v) => (v === '' ? null : v))
      .filter((v) => v !== null);
    return transformedArray.length > 0 ? transformedArray : null;
  })
  display_authors?: string[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  display_copyright?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_excluded?: boolean;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @IsOptional()
  @IsBoolean()
  is_only_for_purchase?: boolean;

  @IsOptional()
  @IsInt()
  bookshelf_credit_cost?: number;

  @IsOptional()
  @IsInt()
  purchased_rental_license_limit?: number;
}
