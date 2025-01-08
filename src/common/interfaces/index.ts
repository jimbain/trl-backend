export interface PaginationMeta {
  current_page: number;
  from: number | null;
  last_page: number;
  per_page: number;
  to: number | null;
  total: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface AudioEngineAudioBook {
  id: string;
  metadata_sig: string;
  title: string;
  description: string;
  abridgement: string;
  cover_url: string;
  sample_url: string;
  actual_size: number;
  awards: string[];
  publisher: string;
  runtime: string;
  copyright: string;
  chapters: AudioEngineAudioBookChapter[];
  sub_title: string;
  series: string[];
  grade_level: string;
  street_date: string;
  modified_date: string;
  language: string;
  chapterized: boolean;
  drm_free: boolean;
  embargoed: boolean;
  authors: string[];
  narrators: string[];
  audio_updated_date: string;
  image_updated_date: string;
  metadata_updated_date: string;
  product_only_modified: string;
  promotion_only_modified: string;
  supplement_updated_date: string;
  image_etag: string | null;
  audio_version: string;
  supplements: any[];
  bisac_codes: string[];
}

export interface AudioEngineAudioBookChapter {
  part_number: number;
  chapter_number: number;
  duration: number;
  chapter_name: string;
  part_name: string | null;
  file_size: number;
  bitrate: number;
  sample_rate: number;
  format: string | null;
}

export interface AudioEngineAudio {
  audiobook: AudioEngineAudioBook;
  active_products: any;
  inactive_products: any;
  active_promotions: any;
  inactive_promotions: any;
}
