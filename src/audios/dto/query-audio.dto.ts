import { Type } from 'class-transformer';
import { IsOptional, IsArray } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryAudioDto extends PaginationQueryDto {
  @IsOptional()
  @IsArray()
  @Type(() => String)
  ids?: string[];
}
