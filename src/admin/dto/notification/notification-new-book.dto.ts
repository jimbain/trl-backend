import { IsArray, IsEnum, IsString } from 'class-validator';
import {
  Media,
  NOTIFICATION_NEW_BOOK_CONDITION,
  NotificationNewBookConditionType,
} from 'src/constants';

export class NotificationNewBookDto {
  @IsString()
  media_type?: Media;

  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsArray()
  @IsString({ each: true })
  company_ids: string[];

  @IsArray()
  @IsEnum(NOTIFICATION_NEW_BOOK_CONDITION, { each: true })
  conditions: NotificationNewBookConditionType[];

  @IsArray()
  @IsString({ each: true })
  condition_book_ids: string[];

  @IsString()
  redirect_book_id?: string;
}
