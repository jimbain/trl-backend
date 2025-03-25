export const MEDIA = {
  AUDIO: 'audio',
  VIDEO: 'video',
  PHARMA: 'pharma',
} as const;
export type Media = (typeof MEDIA)[keyof typeof MEDIA];

export const MEDIA_AVAILABILITY_TYPE = {
  RENTAL: 'rental',
  PURCHASABLE: 'purchasable',
  BOTH: 'both',
};
export type MediaAvailabilityType =
  (typeof MEDIA_AVAILABILITY_TYPE)[keyof typeof MEDIA_AVAILABILITY_TYPE];

export const COMPANY_CONTACT_RESPONSIBILITY = {
  AUTHORIZE: 'Authorize',
  INVOICE: 'Invoice',
  BOSS: 'Boss',
  REPORT: 'Report',
} as const;
export type CompanyContactResponsibility =
  (typeof COMPANY_CONTACT_RESPONSIBILITY)[keyof typeof COMPANY_CONTACT_RESPONSIBILITY];

export const USER_MEDIA_STATUS = {
  QUEUED: 'queued',
  RENTED: 'rented',
  BOOKSHELVED: 'bookshelved',
};
export type MediaStatus =
  (typeof USER_MEDIA_STATUS)[keyof typeof USER_MEDIA_STATUS];

export const USER_ACTIVITY = {
  QUEUE: 'queue',
  RENT: 'rent',
  KEEP: 'keep',
  PLAY: 'play',
  PAUSE: 'pause',
} as const;
export type UserActivity = (typeof USER_ACTIVITY)[keyof typeof USER_ACTIVITY];

export const NOTIFICATION_CHANNEL = {
  EMAIL: 'email',
  SMS: 'sms',
} as const;
export type NotificationChannel =
  (typeof NOTIFICATION_CHANNEL)[keyof typeof NOTIFICATION_CHANNEL];

export const RENTAL_PERIOD_UNIT = {
  WEEK: 'week',
  MONTH: 'month',
} as const;
export type RentalPeriodUnit =
  (typeof RENTAL_PERIOD_UNIT)[keyof typeof RENTAL_PERIOD_UNIT];

export const CATALOG_CATEGORY_TYPE = {
  DEFAULT: 'default',
  CUSTOM: 'custom',
} as const;

export type CatalogCategoryType =
  (typeof CATALOG_CATEGORY_TYPE)[keyof typeof CATALOG_CATEGORY_TYPE];

export const COMPANY_LOGIN_TYPE = {
  CREDENTIALS: 'credentials',
  SSO: 'sso',
} as const;

export type CompanyLoginEnumType =
  (typeof COMPANY_LOGIN_TYPE)[keyof typeof COMPANY_LOGIN_TYPE];

export const NOTIFICATION_NEW_BOOK_CONDITION = {
  QUEUE: 'queue',
  PLAYED: 'played',
  ACTIVE: 'active',
} as const;

export type NotificationNewBookConditionType =
  (typeof NOTIFICATION_NEW_BOOK_CONDITION)[keyof typeof NOTIFICATION_NEW_BOOK_CONDITION];
