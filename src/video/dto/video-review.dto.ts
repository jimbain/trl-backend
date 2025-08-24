import { Expose } from 'class-transformer';

export class VideoReviewDto {
  @Expose()
  id: string;

  @Expose()
  video_id: string;

  @Expose()
  user_id: string;

  @Expose()
  rate: number;

  @Expose()
  review?: string;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
