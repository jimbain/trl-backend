import { Expose, Transform } from 'class-transformer';

export class AdminCompanyCatalogDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  type: string;

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
