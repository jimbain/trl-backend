import { Expose } from 'class-transformer';

export class NotificationDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}
