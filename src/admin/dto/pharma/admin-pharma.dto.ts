import { Expose } from 'class-transformer';

export class AdminPharmaListDto {
  @Expose()
  id: string;

  @Expose()
  sku: string;

  @Expose()
  title: string;

  @Expose()
  category?: string;

  @Expose()
  is_active: boolean;

  @Expose()
  is_featured: boolean;
}

export class AdminPharmaDto {
  @Expose()
  id: string;

  @Expose()
  sku: string;

  @Expose()
  title: string;

  @Expose()
  description: string;

  @Expose()
  categories: string[];

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
