import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { Catalog } from 'src/catalog/entities/catalog.entity';
import { CATALOG_CATEGORY_TYPE, CatalogCategoryType } from 'src/constants';
import { IsExist } from 'src/validation/validators/is-exist.validator';

export class CreateCategoryDto {
  @IsInt({ message: 'catalog_id must be a number' })
  @IsNotEmpty({ message: 'catalog_id is required' })
  @IsExist(Catalog, 'id')
  catalog_id: number;

  @IsString({ message: 'name must be a string' })
  @IsNotEmpty({ message: 'name is required' })
  name: string;

  @IsBoolean({ message: 'is_active must be a boolean' })
  is_active: boolean;

  @IsEnum(CATALOG_CATEGORY_TYPE, {
    message: `Type must be one of: ${Object.values(CATALOG_CATEGORY_TYPE).join(', ')}`,
  })
  type: CatalogCategoryType;
}
