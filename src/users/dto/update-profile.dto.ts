import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  title: string;

  @IsString()
  phone?: string;

  @IsString()
  address1?: string;

  @IsString()
  address2?: string;

  @IsString()
  city?: string;

  @IsString()
  country?: string;

  @IsString()
  state?: string;

  @IsString()
  zip?: string;
}
