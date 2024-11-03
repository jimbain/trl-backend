import { Expose, Transform } from 'class-transformer';

export class AudioDto {
  @Expose()
  id: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.display_title ?? obj?.metadata?.title ?? null;
  })
  title: string;

  @Expose()
  @Transform(({ obj }) => {
    if (obj?.display_short_description) {
      return obj?.display_short_description;
    } else if (obj?.display_description) {
      return obj?.display_description;
    } else {
      return obj?.metadata?.description;
    }
  })
  description?: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.metadata?.language;
  })
  language?: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.metadata?.publisher;
  })
  publisher?: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.display_copyright ?? obj?.metadata?.copyright ?? null;
  })
  copyright?: Date;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.display_authors ?? obj?.metadata?.authors ?? null;
  })
  authors?: string[];

  @Expose()
  @Transform(({ obj }) => {
    return obj?.metadata?.runtime ?? null;
  })
  runtime?: number;

  @Expose()
  is_featured: boolean;

  @Expose()
  @Transform(({ obj }) => obj?.trl_cost > 1)
  is_premium: boolean;

  @Expose()
  available_for: 'rent' | 'bookshelf' | 'both';

  @Expose()
  @Transform(({ obj }) => {
    return obj?.metadata?.cover_url ?? null;
  })
  image_url?: string;

  @Expose()
  avg_rating: number;

  @Expose()
  status: string;
}

export class AudioListDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  authors?: string[];

  @Expose()
  @Transform(({ value }) => {
    const baseUrl = process.env.BUCKET_BASE_URL || '';
    return value ? `${baseUrl}/${value}` : null;
  })
  image_url?: string;

  @Expose()
  @Transform(({ value }) =>
    value !== null && value !== undefined ? Math.round(value * 10) / 10 : null,
  )
  average_review_rating: number;
}
