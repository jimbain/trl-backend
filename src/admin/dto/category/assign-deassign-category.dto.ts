import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class AssignDeassignCategoryDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one ID must be provided.' })
  @IsString({ each: true })
  ids?: string[];
}
