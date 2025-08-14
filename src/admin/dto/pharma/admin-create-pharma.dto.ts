import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { Pharma } from 'src/pharma/entities/pharma.entity';
import { IsBucketUrl } from 'src/storage/validators/is-bucket-url.validator';
import { IsUnique } from 'src/validation/validators/is-unique.validator';

export class AdminCreatePharmaDto {
  @IsString()
  @IsNotEmpty()
  @IsUnique(
    Pharma,
    'sku',
    {},
    {
      message: 'SKU must be unique',
    },
  )
  sku: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsBoolean()
  @IsOptional()
  is_featured?: boolean;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one category is required' })
  @IsString({ each: true, message: 'Each category must be a string' })
  @IsNotEmpty({ each: true, message: 'Each category ID cannot be empty' })
  categories: string[];

  @IsString()
  @IsOptional()
  @IsBucketUrl({
    message: 'Image URL must be a valid bucket URL',
  })
  image_url?: string;

  @IsString()
  @IsOptional()
  @IsBucketUrl({
    message: 'Video URL must be a valid bucket URL',
  })
  video_url?: string;

  @IsString()
  @IsOptional()
  runtime?: string;
}
