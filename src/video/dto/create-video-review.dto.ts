import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreateVideoReviewDto {
  @IsInt()
  @IsNotEmpty()
  rate: number;

  @IsString()
  @IsOptional()
  review?: string;
}
