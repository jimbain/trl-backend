import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { User } from 'src/users/entities/user.entity';
import { IsUnique } from 'src/validation/validators/is-unique.validator';

@ValidatorConstraint({ name: 'MatchesProperty', async: false })
export class MatchesProperty implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments) {
    const [relatedPropertyName] = args.constraints;
    const relatedValue = (args.object as any)[relatedPropertyName];
    return value === relatedValue;
  }

  defaultMessage() {
    return 'Password confirmation does not match password.';
  }
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsNotEmpty()
  last_name: string;

  @IsString()
  @IsEmail()
  @IsNotEmpty()
  @IsUnique(User, 'email', undefined, {
    message: 'The email has already been taken.',
  })
  @Transform(({ value }) => value.toLowerCase())
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  @Validate(MatchesProperty, ['password'])
  password_confirmation: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['CED', 'MTF Biologics'], {
    message: 'Company must be either "CED" or "MTF Biologics".',
  })
  company: string;
}
