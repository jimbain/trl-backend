import { Expose, Transform } from 'class-transformer';

export class AudioDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  description?: string;

  @Expose()
  audio_category_ids?: string[];

  @Expose()
  language?: string;

  @Expose()
  publisher?: string;

  @Expose()
  copyright?: Date;

  @Expose()
  authors?: string[];

  @Expose()
  rental_cost: number;

  @Expose()
  bookshelf_cost: number;

  @Expose()
  rental_credit: number;

  @Expose()
  bookshelf_credit: number;

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
    return value?.map((url: string | undefined) => url ? `${baseUrl}/${url}` : null);
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
  average_review_rating: number;
}