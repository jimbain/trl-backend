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
    value ? `${process.env.DO_BUCKET_ENDPOINT}/${value}` : null,
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
}

export class CompanyDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ value }) =>
    value ? `${process.env.DO_BUCKET_ENDPOINT}/${value}` : null,
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
}
