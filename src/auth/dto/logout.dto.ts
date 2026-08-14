import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @IsString()
  @IsOptional()
  device_id?: string;
}
