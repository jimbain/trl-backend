import { Expose, Transform } from 'class-transformer';

export class ProfileDto {
  @Expose()
  @Transform(({ obj }) => `${obj.first_name} ${obj.last_name}`)
  name: string;

  @Expose()
  email: string;

  @Expose()
  phone: string;

  @Expose()
  address1: string;

  @Expose()
  address2: string;

  @Expose()
  city: string;

  @Expose()
  country: string;

  @Expose()
  state: string;

  @Expose()
  zip: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.company?.name ?? null;
  })
  company: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.company?.available_credits ?? null;
  })
  available_credits: number;
}
