import { IsEnum, IsOptional, IsString, IsIn } from 'class-validator';
import { Transform } from 'class-transformer';

export enum ExportUserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ALL = 'all',
}

export enum ExportSortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

const ALLOWED_SORT_COLUMNS = ['id', 'name', 'is_active', 'created_at'];

export class ExportUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsEnum(ExportUserStatus)
  status?: ExportUserStatus | null = null;

  @IsOptional()
  @Transform(({ value }) =>
    ['asc', 'desc'].includes(value?.toLowerCase())
      ? value.toUpperCase()
      : 'DESC',
  )
  @IsEnum(ExportSortOrder)
  sort_order: ExportSortOrder = ExportSortOrder.DESC;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    ALLOWED_SORT_COLUMNS.includes(value?.toLowerCase())
      ? value.toLowerCase()
      : 'created_at',
  )
  @IsIn(ALLOWED_SORT_COLUMNS, {
    message: `sort_column must be one of: ${ALLOWED_SORT_COLUMNS.join(', ')}`,
  })
  sort_column: string = 'created_at';
}
