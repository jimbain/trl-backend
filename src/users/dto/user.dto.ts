import { Expose, Transform, Type } from 'class-transformer';

export class UserDto {
  @Expose()
  id: string;

  @Expose()
  @Transform(({ obj }) => `${obj.first_name} ${obj.last_name}`)
  name: string;

  @Expose()
  email: string;

  @Expose()
  @Transform(({ obj }) => obj?.company?.name ?? null)
  company: string;
}
