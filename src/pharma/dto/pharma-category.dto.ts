import { Expose, Transform } from 'class-transformer';
import { CatalogCategoryType } from 'src/constants';

export function getPopularity(): number {
  return Math.floor(Math.random() * (200 - 50 + 1)) + 50;
}

export class PharmaCategoryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  type: CatalogCategoryType;

  @Expose()
  @Transform(({ obj }) => getPopularity())
  popularity: number;
}
