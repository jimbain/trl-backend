import { Expose, Transform } from 'class-transformer';

export class UserDto {
  @Expose()
  id: string;

  @Expose()
  first_name: string;

  @Expose()
  last_name: string;

  @Expose()
  @Transform(({ obj }) => `${obj.first_name} ${obj.last_name}`)
  name: string;

  @Expose()
  email: string;
}
