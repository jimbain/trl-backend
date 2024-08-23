import { Expose, Transform } from 'class-transformer';

export class AudioDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  short_description?: string;

  @Expose()
  long_description?: string;

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
  created_at: Date;

  @Expose()
  updated_at: Date;
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
}