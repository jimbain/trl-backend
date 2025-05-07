import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';
import { MEDIA, Media, USER_ACTIVITY, UserActivity } from 'src/constants';
import { UserActivityMeta } from '../user.interface';

export class CreateUserActivityLogDto {
  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsString()
  @IsNotEmpty()
  item_id: string;

  @IsNotEmpty()
  @IsIn(Object.values(MEDIA))
  item_type: Media;

  @IsNotEmpty()
  @IsIn(Object.values(USER_ACTIVITY))
  action: UserActivity;

  @IsObject()
  @IsNotEmpty()
  meta: UserActivityMeta;
}
