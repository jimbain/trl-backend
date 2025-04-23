import { ValidationOptions, registerDecorator } from 'class-validator';

export function IsValidDateFormat(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsValidDateFormat',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          const regex = /^\d{4}-\d{2}-\d{2}$/;
          if (!regex.test(value)) return false;

          const date = new Date(value);
          const [year, month, day] = value.split('-').map(Number);

          // Check if the date's components match the original string to avoid JS auto-correction
          return (
            date.getFullYear() === year &&
            date.getMonth() + 1 === month &&
            date.getDate() === day
          );
        },
        defaultMessage(): string {
          return 'Date must be in the format YYYY-MM-DD and be a valid calendar date';
        },
      },
    });
  };
}
