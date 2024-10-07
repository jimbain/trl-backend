import { Expose, Transform } from 'class-transformer';

export class AudioDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  description?: string;

  @Expose()
  language?: string;

  @Expose()
  publisher?: string;

  @Expose()
  copyright?: Date;

  @Expose()
  authors?: string[];

  @Expose()
  duration: number;

  @Expose()
  is_featured: boolean;

  @Expose()
  @Transform(({ obj }) => obj.bookshelf_credit > 1)
  is_premium: boolean;

  @Expose()
  available_for: 'rent' | 'bookshelf' | 'both';

  @Expose()
  @Transform(({ value }) => {
    const baseUrl = process.env.BUCKET_BASE_URL || '';
    return value ? `${baseUrl}/${value}` : null;
  })
  image_url?: string;

  @Expose()
  @Transform(({ value }: { value?: string[] }) => {
    const baseUrl = process.env.BUCKET_BASE_URL || '';
    return value?.map((url: string | undefined) =>
      url ? `${baseUrl}/${url}` : null,
    );
  })
  audio_urls?: string[];

  @Expose()
  average_review_rating: number;

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
