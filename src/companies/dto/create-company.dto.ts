import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { COMPANY_LOGIN_TYPE, CompanyLoginEnumType, Media } from 'src/constants';
import { IsUnique } from 'src/validation/validators/is-unique.validator';
import { Company } from '../entities/company.entity';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  @IsUnique(Company, 'name')
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @IsUnique(Company, 'domain')
  domain?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(COMPANY_LOGIN_TYPE)
  login_type: CompanyLoginEnumType;

  @IsOptional()
  sso_config?: object;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: 'available_medias must contain at least one item',
  })
  @Transform(
    ({ value }) => {
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (error) {
        return [];
      }
    },
    { toClassOnly: true },
  )
  available_medias?: Media[];

  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10) ?? 0, { toClassOnly: true })
  available_credits: number;

  @IsOptional()
  @IsArray()
  @Transform(
    ({ value }) => {
      try {
        return typeof value === 'string' ? JSON.parse(value) : value;
      } catch (error) {
        return [];
      }
    },
    { toClassOnly: true },
  )
  contacts?: object[];

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address1?: string;

  @IsOptional()
  @IsString()
  address2?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  zip?: string;

  @IsBoolean()
  @IsOptional()
  @Transform(
    ({ value }) =>
      value === undefined ? true : value === 'true' || value === true,
    { toClassOnly: true },
  )
  is_active?: boolean;
}
