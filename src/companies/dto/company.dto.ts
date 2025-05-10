import { Expose, Transform } from 'class-transformer';
import { CompanyContact } from '../company.interface';
import { CatalogDto } from 'src/catalog/dto/catalog.dto';
import { config } from 'dotenv';
import { Media } from 'src/constants';

config();

export class CompanyListDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ value }) =>
    value ? `${process.env.DO_BUCKET_FRONTEND_ENDPOINT}/${value}` : null,
  )
  logo_url: string;

  @Expose()
  is_active: boolean;

  @Expose()
  domain: string;

  @Expose()
  description: string;

  @Expose()
  login_type: string;

  @Expose()
  available_medias: Media[];

  @Expose()
  available_credits: number;

  @Expose()
  @Transform(({ value }) => parseInt(value) ?? 0)
  active_user_count: number;

  @Expose()
  created_at: string;
}

export class CompanyBasicDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ value }) =>
    value ? `${process.env.DO_BUCKET_FRONTEND_ENDPOINT}/${value}` : null,
  )
  logo_url: string;
}

export class CompanyDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ value }) =>
    value ? `${process.env.DO_BUCKET_FRONTEND_ENDPOINT}/${value}` : null,
  )
  logo_url: string;

  @Expose()
  is_active: boolean;

  @Expose()
  domain: string;

  @Expose()
  description: string;

  @Expose()
  login_type: string;

  @Expose()
  available_medias: string;

  @Expose()
  available_credits: number;

  @Expose()
  contacts: CompanyContact[];

  @Expose()
  catalogs: CatalogDto[] | number[];

  @Expose()
  app_configs: Record<string, string> | null;

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
  @Transform(({ obj }) => obj?.userCount ?? 0)
  active_user_count?: number;
}
