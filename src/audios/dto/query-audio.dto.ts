import { Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';

export class QueryAudioDto {
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
  @Type(() => String)
  ids?: string[];
}
