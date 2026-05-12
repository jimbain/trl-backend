import { Expose, Transform } from 'class-transformer';

export class RecommendedAudioDto {
  @Expose()
  id: string;

  @Expose()
  sku: string;

  @Expose()
  @Transform(({ obj }) => obj.display_title ?? obj?.metadata?.title ?? null)
  title: string | null;

  @Expose()
  @Transform(({ obj }) => obj.display_authors ?? obj?.metadata?.authors ?? [])
  authors: string[];

  @Expose()
  @Transform(({ obj }) => obj?.metadata?.cover_url ?? null)
  image_url: string | null;

  @Expose()
  avg_rating: number;

  @Expose()
  is_active: boolean;

  @Expose()
  score: number;
}
