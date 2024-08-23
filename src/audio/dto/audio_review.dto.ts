import { Expose, Type } from 'class-transformer';
import { UserDto } from 'src/user/dto/user.dto';

export class AudioReviewDto {
    @Expose()
    id: string;

    @Expose()
    rate: number;

    @Expose()
    review: string;

    @Expose()
    @Type(() => UserDto)
    user: UserDto;

    @Expose()
    created_at: Date;

    @Expose()
    updated_at: Date;
}
