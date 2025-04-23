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

  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1, { message: 'Ids array must have at least one item' })
  @Type(() => String)
  ids?: string[];
}
