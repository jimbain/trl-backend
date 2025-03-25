import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  COMPANY_CONTACT_RESPONSIBILITY,
  COMPANY_LOGIN_TYPE,
  CompanyContactResponsibility,
  CompanyLoginEnumType,
  Media,
} from 'src/constants';
import { IsUnique } from 'src/validation/validators/is-unique.validator';
import { Company } from '../entities/company.entity';

export class CompanyContactDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  phone?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(Object.values(COMPANY_CONTACT_RESPONSIBILITY), { each: true })
  responsibility: CompanyContactResponsibility[];
}

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
  @Transform(({ value }) => (value === '' ? null : value))
  description?: string;

  @IsEnum(COMPANY_LOGIN_TYPE)
  login_type: CompanyLoginEnumType;

  @IsOptional()
  sso_config?: object;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, {
    message: 'Available medias must contain at least one item',
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
  @Min(1)
  @IsNotEmpty()
  @Transform(({ value }) => parseInt(value, 10) ?? 0, { toClassOnly: true })
  available_credits: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompanyContactDto)
  @ArrayMinSize(1, { message: 'Contacts array must have at least one item' })
  @Transform(({ value }) => {
    if (!value) return [];

    try {
      if (typeof value === 'string') {
        const parsedValue = JSON.parse(value);

        if (Array.isArray(parsedValue)) {
          return plainToInstance(CompanyContactDto, parsedValue); // ✅ Ensure correct DTO instance
        }
      }
      return plainToInstance(CompanyContactDto, value);
    } catch (error) {
      console.error('JSON Parse Error in contacts:', error);
      return [];
    }
  })
  contacts: CompanyContactDto[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  phone?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  address1?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  address2?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  city?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  country?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
  state?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (value === '' ? null : value))
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
