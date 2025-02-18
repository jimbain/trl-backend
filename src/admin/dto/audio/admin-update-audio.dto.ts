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
  display_title?: string;

  @IsOptional()
  @IsString()
  display_description?: string;

  @IsOptional()
  @IsString()
  display_short_description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  display_authors?: string[];

  @IsOptional()
  @IsString()
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
