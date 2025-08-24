import { Type } from 'class-transformer';
import {
  ValidateNested,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class AdminBulkUpdateVideoItemDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;
}

export class AdminBulkUpdateVideoDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AdminBulkUpdateVideoItemDto)
  updates: AdminBulkUpdateVideoItemDto[];
}
