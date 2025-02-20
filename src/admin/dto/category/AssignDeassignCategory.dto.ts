import { IsArray, IsString } from 'class-validator';

export class AssignDeassignCategoryDto {
  @IsArray()
  @IsString({ each: true })
  ids?: string[];
}
