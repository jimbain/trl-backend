import { Expose, Transform, Type } from 'class-transformer';

export class PharmaReviewUserDto {
  @Expose()
  id: string;

  @Expose()
  @Transform(({ obj }) => `${obj.first_name} ${obj.last_name}`)
  name: string;
}

export class PharmaReviewDto {
  @Expose()
  id: string;

  @Expose()
  rate: number;

  @Expose()
  review: string;

  @Expose()
  @Type(() => PharmaReviewUserDto)
  user: PharmaReviewUserDto;
}
