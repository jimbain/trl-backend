import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { IsUnique } from 'src/validation/validators/is-unique.validator';
import { User } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  title: string;

  @IsEmail()
  @IsUnique(User, 'email')
  email: string;

  @IsString()
  password: string;

  @IsBoolean()
  is_active: boolean;

  @IsBoolean()
  optout_push_notification: boolean;

  @IsString()
  @IsOptional()
  company_id?: string;
}
