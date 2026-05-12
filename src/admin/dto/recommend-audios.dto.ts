import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class RecommendAudiosDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  prompt: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number;
}
