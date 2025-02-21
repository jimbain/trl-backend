import { IsNotEmpty, IsString, IsArray, IsObject } from 'class-validator';
import { ImportUser } from '../user.interface';

export class CreateUserRegistrationLogDto {
  @IsString()
  @IsNotEmpty()
  company_id: string;

  @IsArray()
  @IsNotEmpty()
  csv_content: ImportUser[];

  @IsObject()
  meta?: object;
}
