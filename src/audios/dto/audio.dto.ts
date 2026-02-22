import { Expose, Transform } from 'class-transformer';
import { MEDIA_AVAILABILITY_TYPE } from 'src/constants';

/**
 * Applies company config restriction to metadata's available_for value.
 * Uses intersection logic: the final result is the most restrictive combination.
 *
 * @param metadataAvailableFor - From AudioMetadata.available_for ('rental' | 'purchasable' | 'both')
 * @param configAction - From Company app_configs.available_audio_title_user_action ('rent' | 'bookshelf' | 'both')
 * @returns The intersection of both: 'rent' | 'bookshelf' | 'both' | null
 */
export function applyConfigRestriction(
  metadataAvailableFor: string | undefined,
  configAction: 'rent' | 'bookshelf' | 'both' | undefined,
): 'rent' | 'bookshelf' | 'both' | null {
  // If no metadata value, return null
  if (!metadataAvailableFor) {
    return null;
  }

  // If no config restriction, apply default logic based on metadata
  if (!configAction) {
    return metadataAvailableFor === MEDIA_AVAILABILITY_TYPE.RENTAL
      ? 'rent'
      : metadataAvailableFor === MEDIA_AVAILABILITY_TYPE.PURCHASABLE
        ? 'bookshelf'
        : metadataAvailableFor === MEDIA_AVAILABILITY_TYPE.BOTH
          ? 'both'
          : null;
  }

  // Convert metadata to allowed actions
  const metadataActions =
    {
      [MEDIA_AVAILABILITY_TYPE.RENTAL]: ['rent'],
      [MEDIA_AVAILABILITY_TYPE.PURCHASABLE]: ['bookshelf'],
      [MEDIA_AVAILABILITY_TYPE.BOTH]: ['rent', 'bookshelf'],
    }[metadataAvailableFor] || [];

  // Convert config to allowed actions
  const configActions =
    {
      rent: ['rent'],
      bookshelf: ['bookshelf'],
      both: ['rent', 'bookshelf'],
    }[configAction] || [];

  // Find intersection (most restrictive wins)
  const allowedActions = metadataActions.filter((a) =>
    configActions.includes(a),
  );

  if (allowedActions.length === 0) {
    return null;
  }
  if (allowedActions.includes('rent') && allowedActions.includes('bookshelf')) {
    return 'both';
  }
  if (allowedActions.includes('rent')) {
    return 'rent';
  }
  if (allowedActions.includes('bookshelf')) {
    return 'bookshelf';
  }

  return null;
}

export function getAvailableFor(
  audio: any,
  configAction?: 'rent' | 'bookshelf' | 'both',
): 'rent' | 'bookshelf' | 'both' | null {
  const rentalCost = Number(audio.rental_credit_cost || 0);
  const canRent = audio.total_rented < audio.purchased_rental_license_limit;
  const availableFor = audio?.available_for ?? audio?.metadata?.available_for;

  // First, apply config restriction to get the allowed actions
  const configRestricted = applyConfigRestriction(availableFor, configAction);

  // If config restriction resulted in null, no actions available
  if (configRestricted === null) {
    return null;
  }

  switch (configRestricted) {
    case 'rent':
      return canRent ? 'rent' : null;

    case 'bookshelf':
      return audio.is_only_for_purchase ? 'bookshelf' : 'bookshelf';

    case 'both':
      if (canRent && rentalCost <= audio.bookshelf_credit_cost) {
        return 'both';
      } else {
        return 'bookshelf';
      }

    default:
      return null;
  }
}

export function getAvailableForMessage(
  audio: any,
  configAction?: 'rent' | 'bookshelf' | 'both',
): string | null {
  const canRent = audio.total_rented < audio.purchased_rental_license_limit;
  const rentalCost = Number(audio.rental_credit_cost || 0);
  const bookshelfCost = audio.bookshelf_credit_cost;
  const availableFor = audio?.available_for ?? audio?.metadata?.available_for;

  // Apply config restriction first
  const configRestricted = applyConfigRestriction(availableFor, configAction);

  if (configRestricted === null) {
    return null;
  }

  switch (configRestricted) {
    case 'bookshelf':
      return audio.is_only_for_purchase
        ? 'This book will be added to your bookshelf and does not need to be checked back in.'
        : 'This book will be added to your bookshelf and does not need to be checked back in.';

    case 'rent':
      return canRent ? 'This book will be available for two weeks.' : null;

    case 'both':
      if (canRent && rentalCost <= bookshelfCost) {
        return 'This book can be rented for two weeks or added to your bookshelf and not checked back in.';
      } else {
        return 'This book will be added to your bookshelf and does not need to be checked back in.';
      }

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
  @Transform(({ obj }) =>
    getAvailableFor(obj, obj?.available_audio_title_user_action),
  )
  available_for: 'rent' | 'bookshelf' | 'both' | null;

  @Expose()
  @Transform(({ obj }) =>
    getAvailableForMessage(obj, obj?.available_audio_title_user_action),
  )
  available_for_message: string | null;

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

  @Expose()
  @Transform(({ obj }) => {
    return obj?.metadata?.chapters?.length ?? 0;
  })
  total_chapters: number;
}

export class AudioListDto {
  @Expose()
  id: string;

  @Expose()
  title: string;

  @Expose()
  authors?: string[];

  @Expose()
  image_url?: string;

  @Expose()
  avg_rating: number;

  @Expose()
  @Transform(({ obj }) =>
    getAvailableFor(obj, obj?.available_audio_title_user_action),
  )
  available_for: 'rent' | 'bookshelf' | 'both' | null;

  @Expose()
  updated_at?: Date;

  @Expose()
  status?: string;

  @Expose()
  rental_expires_at?: Date;

  @Expose()
  @Transform(({ obj }) => {
    return obj?.chapters?.length ?? 0;
  })
  total_chapters: number;
}
