export const MEDIA_TYPES = ['audio', 'video', 'pharma'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const RESPONSIBILITY_TYPE = [
  'main',
  'report',
  'invoice',
  'approval',
] as const;
export type ResponsibilityType = (typeof RESPONSIBILITY_TYPE)[number];

export enum AUDIO_AVAILABILITY_TYPE {
  RENT = 'rental',
  BOOKSHELF = 'bookshelf',
  BOTH = 'both',
}

export enum USER_ACTITIVITY {
  QUEUE = 'queue',
  RENT = 'rent',
  KEEP = 'keep',
  PLAY = 'play',
}
