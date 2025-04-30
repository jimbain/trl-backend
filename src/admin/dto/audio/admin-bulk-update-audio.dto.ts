import { Type } from 'class-transformer';
import {
  ValidateNested,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class AdminBulkUpdateAudioItemDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_excluded?: boolean;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;
}

export class AdminBulkUpdateAudioDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AdminBulkUpdateAudioItemDto)
  updates: AdminBulkUpdateAudioItemDto[];
}
