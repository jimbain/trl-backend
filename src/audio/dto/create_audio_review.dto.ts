import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreateAudioReview {
  @IsInt()
  @IsNotEmpty()
  rate: number;

  @IsString()
  @IsOptional()
  review?: string;
}
