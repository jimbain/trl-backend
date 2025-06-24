import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  IsNumber,
  IsNotEmpty,
} from 'class-validator';
import { IsBucketUrl } from 'src/storage/validators/is-bucket-url.validator';

export class AdminCreatePharmaDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  @IsBucketUrl({
    message: 'Image url must be a valid URL',
  })
  image_url?: string;

  @IsString()
  @IsOptional()
  @IsBucketUrl({
    message: 'Video url must be a valid URL',
  })
  video_url?: string;

  @IsString()
  @IsOptional()
  runtime?: string;
}
