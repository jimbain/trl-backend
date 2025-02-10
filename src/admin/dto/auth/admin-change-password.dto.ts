import { IsNotEmpty, IsString } from 'class-validator';

export class AdminChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  new_password: string;

  @IsString()
  @IsNotEmpty()
  password_confirmation: string;
}
