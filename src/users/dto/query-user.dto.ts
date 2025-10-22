import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsIn,
  IsBoolean,
  IsEmail,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ALL = 'all',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

const ALLOWED_SORT_COLUMNS = ['id', 'name', 'is_active', 'created_at'];

export class QueryUserDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  per_page: number = 20;

  @IsOptional()
  @IsString()
  company_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  company_ids?: string[];

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus | null = null;

  @IsOptional()
  @Transform(({ value }) =>
    ['asc', 'desc'].includes(value?.toLowerCase())
      ? value.toUpperCase()
      : 'DESC',
  )
  @IsEnum(SortOrder)
  sort_order: SortOrder = SortOrder.DESC;

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

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  is_basic?: boolean = false;
}
