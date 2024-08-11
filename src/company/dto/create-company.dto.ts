import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { IsUnique } from 'src/validation/validators/is-unique.validator';
import { Company } from 'src/company/entities/company.entity';

export class CreateCompanyDto {
    @IsString()
    @IsNotEmpty()
    @IsUnique(Company, 'name')
    name: string;

    @IsOptional()
    @IsString({ each: true })
    short_description: string | null;

    @IsOptional()
    @IsString({ each: true })
    long_description: string | null;

    @IsOptional()
    @IsString({ each: true })
    logo_url: string | null;

    @IsOptional()
    @IsString({ each: true })
    @IsUnique(Company, 'domain')
    domain: string | null;

    @IsOptional()
    @IsBoolean()
    is_active: boolean;

    @IsOptional()
    @IsBoolean()
    is_sso_login: boolean;
    
    @IsNumber()
    @Min(0)
    available_credits:number;
}
