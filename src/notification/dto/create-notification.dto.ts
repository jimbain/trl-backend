import { IsDate, IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  @IsNotEmpty()
  event_type: string;

  @IsObject()
  @IsNotEmpty()
  data: object;

  @IsString()
  @IsNotEmpty()
  @IsIn(['user', 'company'], {
    message: 'Recipient type must be either "user" or "company".',
  })
  recipient_type: string;

  @IsString()
  @IsNotEmpty()
  recipient_id: string;

  @IsDate()
  @IsNotEmpty()
  expire_at: Date;
}
