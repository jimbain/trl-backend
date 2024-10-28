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
  MAIN: 'main',
  REPORT: 'report',
  INVOICE: 'invoice',
  APPROVAL: 'approval',
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

export const USER_ACTITIVITY = {
  QUEUE: 'queue',
  RENT: 'rent',
  KEEP: 'keep',
  PLAY: 'play',
};
export type UserActivity = (typeof MEDIA)[keyof typeof MEDIA];

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
