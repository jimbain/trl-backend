import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { Injectable, BadRequestException } from '@nestjs/common';
import { CategoryService } from 'src/categories/category.service';
import { CatalogService } from 'src/catalog/catalog.service';
import { CATALOG_CATEGORY_TYPE, MEDIA } from 'src/constants';

@Injectable()
@ValidatorConstraint({ async: true })
export class IsDefaultAudioCategoriesConstraint
  implements ValidatorConstraintInterface
{
  constructor(
    private readonly categoryService: CategoryService,
    private readonly catalogService: CatalogService,
  ) {}

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    // If value is not an array or is empty, return true (other validators should handle this)
    if (!Array.isArray(value) || value.length === 0) {
      return true;
    }

    try {
      // Fetch all category entities
      const categories = await this.categoryService.findEntitiesByIds(value);

      // Check if all category IDs exist and are active
      if (categories.length !== value.length) {
        const foundIds = new Set(categories.map((c) => c.id));
        const missingIds = value.filter((id) => !foundIds.has(id));
        throw new BadRequestException(
          `Categories not found or inactive: ${missingIds.join(', ')}`,
        );
      }

      // Check if all categories are of type 'default'
      const nonDefaultCategories = categories.filter(
        (cat) => cat.type !== CATALOG_CATEGORY_TYPE.DEFAULT,
      );

      if (nonDefaultCategories.length > 0) {
        throw new BadRequestException(
          `Categories must be of type 'default': ${nonDefaultCategories.map((c) => c.id).join(', ')}`,
        );
      }

      // Get the default audio catalog
      const defaultAudioCatalog = await this.catalogService.findDefaultByType(
        MEDIA.AUDIO,
      );

      // Check if all categories are in the default audio catalog
      const categoriesNotInCatalog = value.filter(
        (categoryId) => !defaultAudioCatalog.categories.includes(categoryId),
      );

      if (categoriesNotInCatalog.length > 0) {
        throw new BadRequestException(
          `Categories not found in default audio catalog: ${categoriesNotInCatalog.join(', ')}`,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to validate categories: ${error.message}`,
      );
    }
  }

  defaultMessage(args: ValidationArguments): string {
    return 'Categories must be default type and in the default audio catalog';
  }
}

export function IsDefaultAudioCategories(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsDefaultAudioCategoriesConstraint,
    });
  };
}
