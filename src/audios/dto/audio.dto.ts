import { Expose, Transform } from 'class-transformer';
import { MEDIA_AVAILABILITY_TYPE } from 'src/constants';

export function getAvailableFor(
  audio: any,
): 'rent' | 'bookshelf' | 'both' | null {
  if (!audio?.available_for) {
    return null;
  }

  const {
    available_for,
    total_rented,
    purchased_rental_license_limit,
    is_only_for_purchase,
    rental_credit_cost,
    bookshelf_credit_cost,
  } = audio;

  const canRent = total_rented < purchased_rental_license_limit;

  switch (available_for) {
    case MEDIA_AVAILABILITY_TYPE.RENTAL:
      return canRent ? 'rent' : null;

    case MEDIA_AVAILABILITY_TYPE.PURCHASABLE:
      return is_only_for_purchase ? 'bookshelf' : null;

    case MEDIA_AVAILABILITY_TYPE.BOTH:
      if (canRent && rental_credit_cost < bookshelf_credit_cost) {
        return 'both';
      }
      return 'bookshelf';

    default:
      return null;
  }
}

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
  @Transform(({ obj }) => obj?.bookshelf_credit_cost > 1)
  is_premium: boolean;

  @Expose()
  @Transform(({ obj }) => getAvailableFor(obj))
  available_for: 'rent' | 'bookshelf' | 'both' | null;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.metadata?.cover_url ?? null;
  })
  image_url?: string;

  @Expose()
  avg_rating: number;

  @Expose()
  status: string;

  @Expose()
  rental_expires_at: Date;
}

export class AudioListDto {
  @Expose()
  id: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.display_title ?? obj?.metadata?.title ?? null;
  })
  title: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.display_authors ?? obj?.metadata?.authors ?? null;
  })
  authors?: string[];

  @Expose()
  @Transform(({ obj }) => {
    return obj?.metadata?.cover_url ?? null;
  })
  image_url?: string;

  @Expose()
  avg_rating: number;

  @Expose()
  @Transform(({ obj }) => getAvailableFor(obj))
  available_for: 'rent' | 'bookshelf' | 'both' | null;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.userAudioStatus?.updated_at ?? null;
  })
  updated_at?: Date;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.userAudioStatus?.status ?? null;
  })
  status?: string;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.userAudioStatus?.rental_expire_at ?? null;
  })
  rental_expires_at?: Date;
}
