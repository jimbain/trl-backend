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
export class IsExistConstraint implements ValidatorConstraintInterface {
  constructor(private readonly entityManager: EntityManager) {}

  async validate(value: any, args: ValidationArguments) {
    const [entityClass, fieldName] = args.constraints;
    const repository = this.entityManager.getRepository(entityClass);

    // Check if any entity exists with the given value in the column
    const entity = await repository.findOne({
      where: {
        [fieldName]: fieldName === 'email' ? value.toLowerCase() : value,
      },
    });
    return !!entity; // Return true if the value exists, false otherwise
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} does not exist`;
  }
}

export function IsExist(
  entityClass: any,
  field: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [entityClass, field],
      validator: IsExistConstraint,
    });
  };
}
