import { Expose, Transform } from 'class-transformer';

export class AdminVideoListDto {
  @Expose()
  id: string;

  @Expose()
  group?: string;

  @Expose()
  sku: string;

  @Expose()
  title: string;

  @Expose()
  is_active: boolean;

  @Expose()
  is_featured: boolean;
}

export class AdminVideoDto extends AdminVideoListDto {
  @Expose()
  description?: string;

  @Expose()
  categories: string[];

  @Expose()
  image_url?: string;

  @Expose()
  runtime?: string;

  @Expose()
  avilar_course_id?: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
