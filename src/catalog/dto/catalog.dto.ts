import { Expose } from 'class-transformer';

export class CatalogDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  type: string;

  @Expose()
  is_active: boolean;

  @Expose()
  media_type: string;
}
