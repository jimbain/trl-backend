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
import { COMPANY_LOGIN_TYPE } from 'src/constants';

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

    // Use query builder with LOWER() for case-insensitive comparison
    const user = await this.entityManager
      .createQueryBuilder(User, 'user')
      .leftJoinAndSelect('user.company', 'company')
      .where('LOWER(user.email) = LOWER(:email)', { email: value })
      .getOne();

    if (!user) {
      this.errorMessage = 'User does not exist';
      return false;
    }
    console.log(user.company.login_type);
    if (user.company.login_type === COMPANY_LOGIN_TYPE.SSO) {
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
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: IsBasicAuthCompanyUserConstraint,
    });
  };
}
