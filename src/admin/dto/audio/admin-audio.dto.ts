import { Expose, Transform, Type } from 'class-transformer';

export class AdminAudioListDto {
  @Expose()
  id: string;

  @Expose()
  @Transform(({ obj }) => obj?.display_title ?? obj?.title)
  title: string;

  @Expose()
  @Transform(({ obj }) =>
    obj?.display_authors?.length ? obj?.display_authors : obj?.authors,
  )
  authors?: string[];

  @Expose()
  @Transform(({ obj }) => obj?.display_copyright ?? obj?.copyright)
  copyright?: string;

  @Expose()
  @Transform(({ obj }) => obj?.cover_url ?? null)
  image_url?: string;

  @Expose()
  @Transform(({ obj }) => obj?.available_for ?? null)
  available_for: 'rent' | 'bookshelf' | 'both' | null;

  @Expose()
  sku: string;

  @Expose()
  bookshelf_credit_cost: number;

  @Expose()
  @Transform(({ value }) => {
    const date = new Date(value);
    return date.toLocaleDateString('en-GB').split('/').join('-');
  })
  created_at: Date;
}

export class MetadataDto {
  @Expose()
  sku: string;

  @Expose()
  title: string;

  @Expose()
  authors: string[];

  @Expose()
  isbn: string;

  @Expose()
  publisher: string;

  @Expose()
  description: string;

  @Expose()
  copyright: string;

  @Expose()
  is_for_sale: boolean;

  @Expose()
  available_for: string;

  @Expose()
  language: string;

  @Expose()
  actual_size: number;

  @Expose()
  narrators: string[];

  @Expose()
  abridgement: string;

  @Expose()
  bisac_codes: string[];

  @Expose()
  runtime: string;

  @Expose()
  product_id: string;

  @Expose()
  retail_product_id: string;

  @Expose()
  metadata_signature: string;

  @Expose()
  findaway_price: string;

  @Expose()
  findaway_content_cost: string;

  @Expose()
  findaway_retail_price: string;

  @Expose()
  findaway_retail_content_cost: string;

  @Expose()
  sales_locations: string;

  @Expose()
  retail_sales_locations: string;

  @Expose()
  sample_url: string;

  @Expose()
  cover_url: string;

  @Expose()
  sub_title: string;

  @Expose()
  chapters: any[];

  @Expose()
  purchased_rental_licenses: number;
}

export class AdminAudioDto {
  @Expose()
  id: string;

  @Expose()
  display_title: string | null;

  @Expose()
  display_authors: string[] | null;

  @Expose()
  display_description: string | null;

  @Expose()
  display_short_description: string | null;

  @Expose()
  display_copyright: string | null;

  @Expose()
  bookshelf_credit_cost: number;

  @Expose()
  purchased_rental_license_limit: number;

  @Expose()
  total_rented: number;

  @Expose()
  is_active: boolean;

  @Expose()
  is_excluded: boolean;

  @Expose()
  is_featured: boolean;

  @Expose()
  is_only_for_purchase: boolean;

  @Expose()
  is_new_trl: boolean;

  @Expose()
  is_curated: boolean;

  @Expose()
  categories: string[];

  @Expose()
  suggestions: any[];

  @Expose()
  @Type(() => MetadataDto)
  metadata?: MetadataDto;
}
