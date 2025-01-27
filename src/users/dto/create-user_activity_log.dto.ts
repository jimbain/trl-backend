import { IsIn, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { MEDIA, Media, USER_ACTIVITY, UserActivity } from 'src/constants';

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
  action_type: UserActivity;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  credit_used: number;
}
