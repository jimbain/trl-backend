import { Expose, Transform } from 'class-transformer';

export class PharmaListDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  description: string;

  @Expose()
  image_url?: string;
}

export class PharmaDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  description: string;

  @Expose()
  image_url?: string;

  @Expose()
  video_url?: string;

  @Expose()
  is_active: boolean;

  @Expose()
  runtime?: string;
}
