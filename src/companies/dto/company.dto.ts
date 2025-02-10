import { Expose } from 'class-transformer';
import { CompanyContact } from '../company.interface';
import { CatalogDto } from 'src/catalog/dto/catalog.dto';

export class CompanyListDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
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
  catalogs: CatalogDto[];

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
