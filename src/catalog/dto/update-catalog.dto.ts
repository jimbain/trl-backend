import { IsBoolean, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CATALOG_CATEGORY_TYPE, CatalogCategoryType } from 'src/constants';

export class UpdateCatalogDto {
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @IsEnum(CATALOG_CATEGORY_TYPE, {
    message: `Type must be one of: ${Object.values(CATALOG_CATEGORY_TYPE).join(', ')}`,
  })
  type: CatalogCategoryType;

  @IsBoolean({ message: 'is_active must be a boolean' })
  is_active: boolean;
}
