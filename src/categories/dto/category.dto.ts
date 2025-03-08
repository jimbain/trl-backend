import { Expose, Transform } from 'class-transformer';

export function getPopularity(): number {
  return Math.floor(Math.random() * (200 - 50 + 1)) + 50;
}

export class CategoryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  is_active: boolean;
}

export class AudioCategoryDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ obj }) => getPopularity())
  popularity: number;
}
