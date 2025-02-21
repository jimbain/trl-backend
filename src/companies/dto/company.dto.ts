import { Expose, Transform } from 'class-transformer';
import { CompanyContact } from '../company.interface';
import { CatalogDto } from 'src/catalog/dto/catalog.dto';
import { config } from 'dotenv';

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
  available_medias: string;

  @Expose()
  available_credits: number;

  @Expose()
  @Transform(({ obj }) => obj?.userCount ?? 0)
  user_count?: number;

  @Expose()
  @Transform(({ obj }) => {
    if (!obj?.created_at) return null;
    const date = new Date(obj.created_at);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  })
  joined_on: string;
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
  user_count?: number;
}
