import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { EntityManager } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { User } from 'src/users/entities/user.entity';

@Injectable()
@ValidatorConstraint({ async: true })
export class IsBasicAuthCompanyUserConstraint
  implements ValidatorConstraintInterface
{
  private errorMessage: string;

  constructor(private readonly entityManager: EntityManager) {}

  async validate(value: any, args: ValidationArguments): Promise<boolean> {
    if (!value) {
      this.errorMessage = 'User does not exist';
      return false;
    }

    const user = await this.entityManager.findOne(User, {
      where: { email: value.toLowerCase() },
      relations: ['company'],
    });

    if (!user) {
      this.errorMessage = 'User does not exist';
      return false;
    }

    if (user.company.is_sso_login) {
      this.errorMessage = "User's company requires SSO login";
      return false;
    }

    return true;
  }

  defaultMessage(args: ValidationArguments) {
    return this.errorMessage || 'Validation failed';
  }
}

export function IsBasicAuthCompanyUser(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsBasicAuthCompanyUserConstraint,
    });
  };
}
