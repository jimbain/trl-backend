import { Expose, Transform, Type } from 'class-transformer';

export class AudioReviewUserDto {
    @Expose()
    id: string;
  
    @Expose()
    @Transform(({ obj }) => `${obj.first_name} ${obj.last_name}`)
    name: string;
}  

export class AudioReviewDto {
    @Expose()
    id: string;

    @Expose()
    rate: number;

    @Expose()
    review: string;

    @Expose()
    @Type(() => AudioReviewUserDto)
    user: AudioReviewUserDto;
}
