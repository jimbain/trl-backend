import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsEmail } from 'class-validator';
import { IsBasicAuthCompanyUser } from 'src/validation/validators/is_basic_auth_company_user.validator';

export class CheckUserDto {
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  @IsBasicAuthCompanyUser()
  @Transform(({ value }) => value.toLowerCase())
  email: string;
}
