export interface NotificationData {
  audio_id?: number | string;
  title?: string;
  description?: string;
  author?: string;
  image?: string | null;
  expired_at?: string | Date;
  redirect_book_id?: string;
}
