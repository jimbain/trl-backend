import { Expose, Transform } from 'class-transformer';
import { MEDIA_AVAILABILITY_TYPE } from 'src/constants';

export function getAvailableFor(
  audio: any,
): 'rent' | 'bookshelf' | 'both' | null {
  if (audio?.total_rented >= audio?.purchased_licenses) {
    return null;
  }

  return audio?.available_for === MEDIA_AVAILABILITY_TYPE.PURCHASABLE
    ? 'bookshelf'
    : audio?.available_for === MEDIA_AVAILABILITY_TYPE.RENTAL
      ? 'rent'
      : 'both';
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
  @Transform(({ obj }) => obj?.trl_cost > 1)
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
