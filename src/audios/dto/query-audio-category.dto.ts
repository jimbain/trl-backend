import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryAudioCategoryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === 'category_0' ? null : value))
  category_id?: string;
}
