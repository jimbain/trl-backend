import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import {
  Media,
  NOTIFICATION_NEW_BOOK_CONDITION,
  NotificationNewBookConditionType,
} from 'src/constants';

export class NotificationNewBookDto {
  @IsString()
  @IsNotEmpty()
  media_type?: Media;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty({ message: 'Please select company' })
  company_ids: string[];

  @IsArray()
  @IsEnum(NOTIFICATION_NEW_BOOK_CONDITION, { each: true })
  @ArrayNotEmpty({ message: 'Please select condition' })
  conditions: NotificationNewBookConditionType[];

  @IsArray()
  @IsString({ each: true })
  @ArrayNotEmpty({ message: 'Please select book' })
  condition_book_ids: string[];

  @IsString()
  @IsNotEmpty()
  redirect_book_id?: string;
}
