import { PartialType } from '@nestjs/mapped-types';
import { CreateCategoryDto } from './create-category.dto';
import { IsOptional } from 'class-validator';
import { IsExist } from 'src/validation/validators/is-exist.validator';
import { Catalog } from 'src/catalog/entities/catalog.entity';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @IsOptional()
  @IsExist(Catalog, 'id')
  catalog_id?: number;
}
