import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { EntityManager } from 'typeorm';
import { Injectable } from '@nestjs/common';

@Injectable()
@ValidatorConstraint({ async: true })
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private readonly entityManager: EntityManager) {}

  async validate(value: any, args: ValidationArguments) {
    const [entityClass, fieldName, ignoreConditions] = args.constraints;
    const repository = this.entityManager.getRepository(entityClass);

    // Build the query to check for uniqueness
    const queryBuilder = repository.createQueryBuilder('entity');
    queryBuilder.where(`entity.${fieldName} = :value`, { value });

    // Add conditions to ignore specific rows
    if (ignoreConditions && Object.values(ignoreConditions)?.length) {
      Object.keys(ignoreConditions).forEach((key) => {
        queryBuilder.andWhere(`entity.${key} != :${key}`, {
          [key]: ignoreConditions[key],
        });
      });
    }
    // Execute the query
    const entity = await queryBuilder.getOne();
    return !entity; // Return true if the value is unique, false otherwise
  }

  defaultMessage(args: ValidationArguments) {
    return `The ${args.property} already exist`;
  }
}

export function IsUnique(
  entityClass: any,
  field: string,
  ignoreConditions?: Record<string, any>,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [entityClass, field, ignoreConditions],
      validator: IsUniqueConstraint,
    });
  };
}
