import {
  IsArray,
  IsDate,
  IsNotEmpty,
  IsObject,
  IsString,
} from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  event_type: string;

  @IsObject()
  @IsNotEmpty()
  data: object;

  @IsArray()
  @IsString({ each: true })
  user_ids: string[];

  @IsDate()
  @IsNotEmpty()
  expire_at: Date;
}
