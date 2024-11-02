import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  address1: string;

  @IsString()
  @IsNotEmpty()
  address2: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  zip: string;
}
