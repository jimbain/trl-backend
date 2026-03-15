import { Expose, Transform } from 'class-transformer';

export class UserListDto {
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

  @Expose()
  is_active: boolean;
}

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
  title: string;

  @Expose()
  email: string;

  @Expose()
  is_active: boolean;

  @Expose()
  optout_push_notification: boolean;

  @Expose()
  @Transform(({ obj }) => obj?.company?.name || null)
  company: string | null;

  @Expose()
  @Transform(({ obj }) => obj?.company?.description || null)
  banner_text: string | null;

  @Expose()
  @Transform(({ obj }) => obj?.company?.available_medias || [])
  available_medias: string[];

  @Expose()
  @Transform(({ obj }) => obj?.company?.domain || null)
  domain: string | null;
}
