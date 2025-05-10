import { IsString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { User } from 'src/users/entities/user.entity';
import { IsExist } from 'src/validation/validators/is-exist.validator';

export class CreateAppErrorLogDto {
  @IsString()
  @IsOptional()
  @IsExist(User, 'id')
  user_id?: string;

  @IsString()
  @IsNotEmpty()
  app_version: string;

  @IsEnum(['ios', 'android'])
  @IsNotEmpty()
  app_platform: 'ios' | 'android';

  @IsString()
  @IsNotEmpty()
  summary: string;

  @IsString()
  @IsNotEmpty()
  stack_trace: string;
}
