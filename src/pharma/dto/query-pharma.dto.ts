import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class QueryPharmaDto {
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
  @IsString({ each: true })
  category_ids?: string[];

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === '1')
  is_featured?: boolean;
}
