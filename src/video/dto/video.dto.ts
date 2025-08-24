import { Expose, Transform } from 'class-transformer';

export class VideoListDto {
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

  @Expose()
  avg_rating: number;

  // User status fields (added dynamically by service)
  @Expose()
  status?: 'queued' | 'rented';

  @Expose()
  current_rental_expire_at?: Date;

  @Expose()
  next_rental_expire_at?: Date;

  @Expose()
  is_rental_valid?: boolean;

  @Expose()
  can_renew?: boolean;

  @Expose()
  can_return?: boolean;
}

export class VideoDto {
  @Expose()
  id: string;

  @Expose()
  sku: string;

  @Expose()
  title: string;

  @Expose()
  description: string;

  @Expose()
  is_featured: boolean;

  @Expose()
  image_url?: string;

  @Expose()
  runtime?: string;

  @Expose()
  avg_rating: number;

  @Expose()
  categories: string[];

  @Expose()
  total_played: number;

  @Expose()
  avilar_course_id?: string;

  // User status fields (added dynamically by service)
  @Expose()
  status?: 'queued' | 'rented';

  @Expose()
  current_rental_expire_at?: Date;

  @Expose()
  next_rental_expire_at?: Date;

  @Expose()
  rental_start_at?: Date;

  @Expose()
  is_rental_valid?: boolean;

  @Expose()
  can_renew?: boolean;

  @Expose()
  can_return?: boolean;

  @Expose()
  play_position?: number;
}
