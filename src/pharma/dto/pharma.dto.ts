import { Expose, Transform } from 'class-transformer';

export class PharmaListDto {
  @Expose()
  id: string;

  @Expose()
  sku: string;

  @Expose()
  title: string;

  @Expose()
  is_active: boolean;

  @Expose()
  is_featured: boolean;

  @Expose()
  image_url?: string;
}

export class PharmaDto {
  @Expose()
  id: string;

  @Expose()
  sku: string;

  @Expose()
  title: string;

  @Expose()
  description: string;

  @Expose()
  is_active: boolean;

  @Expose()
  is_featured: boolean;

  @Expose()
  image_url?: string;

  @Expose()
  video_url?: string;

  @Expose()
  runtime?: string;
}
