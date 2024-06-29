import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments, registerDecorator, ValidationOptions } from 'class-validator';
import { EntityManager } from 'typeorm';
import { Injectable } from '@nestjs/common';

@Injectable()
@ValidatorConstraint({ async: true })
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(
    private readonly entityManager: EntityManager,
  ) {}

  async validate(value: any, args: ValidationArguments) {
    const [entityClass, fieldName] = args.constraints;
    const repository = this.entityManager.getRepository(entityClass);

    // Check if any entity already exists with the given value in the column
    const entity = await repository.findOne({ where: { [fieldName]: value } });
    return !entity; // Return true if the value is unique, false otherwise
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} already exists`;
  }
}

export function IsUnique(entityClass: any, field: string, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [entityClass, field],
      validator: IsUniqueConstraint,
    });
  };
}
