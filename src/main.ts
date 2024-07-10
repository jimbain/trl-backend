import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from './exceptions/validation.exception';
import { useContainer } from 'class-validator';
import { AllExceptionsFilter } from './exceptions/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('APP_PORT', 3000); // Default to 3000 if not set in .env

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [configService.get<string>('FRONTEND_APP_URL')],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically remove non-whitelisted properties
      forbidNonWhitelisted: false, // Throw an error if non-whitelisted properties are present
      transform: true, // Automatically transform payloads to DTO instances
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Integrate NestJS dependency injection container with class-validator. This is for custom validators
  useContainer(app.select(AppModule), { fallbackOnErrors: true });

  await app.listen(port);
}

bootstrap();
