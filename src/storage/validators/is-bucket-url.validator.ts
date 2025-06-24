import { registerDecorator, ValidationOptions } from 'class-validator';
import { ConfigService } from '@nestjs/config';

let bucketBaseUrl: string;

export function initBucketUrlValidator(configService: ConfigService) {
  const region = configService.get<string>('DO_BUCKET_REGION');
  const bucket = configService.get<string>('DO_BUCKET_NAME');
  bucketBaseUrl = `https://${bucket}.${region}.digitaloceanspaces.com`;
}

export function IsBucketUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBucketUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string' || !bucketBaseUrl) return false;
          return value.startsWith(bucketBaseUrl);
        },
        defaultMessage() {
          return `URL must start with the bucket base URL: ${bucketBaseUrl}`;
        },
      },
    });
  };
}
