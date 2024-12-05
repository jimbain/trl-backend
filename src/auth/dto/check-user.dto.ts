import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

export class CheckUserDto {
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }) => value.toLowerCase())
  email: string;
}
