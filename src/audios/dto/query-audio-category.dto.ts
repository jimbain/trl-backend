import { IsOptional, IsString, IsInt } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class QueryAudioCategoryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === 'category_0' ? null : value))
  category_id?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  per_page?: number;
}
