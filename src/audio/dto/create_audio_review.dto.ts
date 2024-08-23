import { Transform } from 'class-transformer';
import {
    IsNotEmpty,
    IsString,
    IsInt,
} from 'class-validator';

export class CreateAudioReview {
    @IsInt()
    @IsNotEmpty()
    rate: number;

    @IsString()
    @IsNotEmpty()
    review: string
}