import { Expose, Transform } from 'class-transformer';

export class NotificationDto {
  @Expose()
  id: string;

  @Expose()
  event_type: string;

  @Expose()
  data: any;

  @Expose()
  @Transform(({ obj }) => {
    console.log(obj?.users_read_status);
  })
  read_at: string;
}
