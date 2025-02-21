import { Expose, Transform } from 'class-transformer';

export class CompanyCreditLogDto {
  @Expose()
  id: number;

  @Expose()
  purchased_credit: number;

  @Expose()
  @Transform(({ obj }) => {
    if (!obj?.created_at) return null;
    const date = new Date(obj.created_at);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  })
  purchased_at: string;
}
