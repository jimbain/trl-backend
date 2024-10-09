import { Expose } from 'class-transformer';

export class CompanyDto {
  @Expose()
  id: string;

  @Expose()
  name: string;
}
