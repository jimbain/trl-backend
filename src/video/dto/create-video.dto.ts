import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
} from 'class-validator';

export class CreateVideoDto {
  @IsString()
  group?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsString()
  runtime?: string;

  @IsOptional()
  @IsNumber()
  avg_rating?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @IsOptional()
  @IsNumber()
  total_played?: number;

  @IsOptional()
  @IsString()
  avilar_course_id?: string;
}
