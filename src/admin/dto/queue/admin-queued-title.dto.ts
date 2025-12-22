import { Expose, Transform, Type } from 'class-transformer';

class UserDto {
  @Expose()
  id: string;

  @Expose()
  first_name: string;

  @Expose()
  last_name: string;

  @Expose()
  email: string;

  @Expose()
  title: string;

  @Expose()
  @Transform(({ obj }) =>
    `${obj?.first_name ?? ''} ${obj?.last_name ?? ''}`.trim(),
  )
  name: string;
}

class CompanyDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ obj }) =>
    obj?.logo_url
      ? `${process.env.DO_BUCKET_FRONTEND_ENDPOINT}/${obj?.logo_url}`
      : null,
  )
  logo_url: string | null;
}

class TitleDto {
  @Expose()
  id: string;

  @Expose()
  type: string;

  @Expose()
  title: string;

  @Expose()
  sku: string;

  @Expose()
  queued_at: Date;
}

export class AdminQueuedTitleDto {
  @Expose()
  id: string;

  @Expose()
  @Type(() => UserDto)
  @Transform(({ obj }) => ({
    id: obj?.user_id,
    first_name: obj?.user_first_name,
    last_name: obj?.user_last_name,
    email: obj?.user_email,
    title: obj?.user_title,
    name: `${obj?.user_first_name ?? ''} ${obj?.user_last_name ?? ''}`.trim(),
  }))
  user: UserDto;

  @Expose()
  @Type(() => CompanyDto)
  @Transform(({ obj }) => ({
    id: obj?.company_id,
    name: obj?.company_name,
    logo_url: obj?.company_logo_url
      ? `${process.env.DO_BUCKET_FRONTEND_ENDPOINT}/${obj?.company_logo_url}`
      : null,
  }))
  company: CompanyDto;

  @Expose()
  @Type(() => TitleDto)
  @Transform(({ obj }) => ({
    id: obj?.item_id,
    type: obj?.item_type,
    title: obj?.title,
    sku: obj?.sku,
    queued_at: obj?.queued_at,
  }))
  title: TitleDto;
}
