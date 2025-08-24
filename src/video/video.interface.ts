export interface VideoInterface {
  id: string;
  sku?: string;
  title: string;
  description?: string;
  is_active: boolean;
  is_featured: boolean;
  image_url?: string;
  runtime?: string;
  avg_rating: number;
  categories: string[];
  total_played: number;
  avilar_course_id?: string;
  group?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface VideoReviewInterface {
  id: string;
  video_id: string;
  user_id: string;
  rate: number;
  review?: string;
  created_at: Date;
  updated_at: Date;
}

export interface VideoUserStatusInterface {
  id: string;
  video_id: string;
  user_id: string;
  status: 'queued' | 'rented';
  rental_start_at?: Date;
  current_rental_expire_at?: Date;
  next_rental_expire_at?: Date;
  created_at: Date;
  updated_at: Date;
}
