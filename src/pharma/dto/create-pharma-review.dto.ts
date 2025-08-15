import { IsNotEmpty, IsString, IsInt, IsOptional } from 'class-validator';

export class CreatePharmaReviewDto {
  @IsInt()
  @IsNotEmpty()
  rate: number;

  @IsString()
  @IsOptional()
  review?: string;
}
