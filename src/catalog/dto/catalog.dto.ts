import { Expose, Transform } from 'class-transformer';

export class CatalogDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  type: string;

  @Expose()
  is_active: boolean;

  @Expose()
  media_type: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj.categories?.length ?? 0;
  })
  total_categories: number;

  @Expose()
  total_titles?: number;
}
