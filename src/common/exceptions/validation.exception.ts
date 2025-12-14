import { HttpException, HttpStatus } from '@nestjs/common';

export class ValidationException extends HttpException {
  constructor(
    statusCode: number,
    error: string,
    message: string,
    public readonly metadata: Record<string, any> = {},
  ) {
    const response = {
      statusCode,
      error,
      message,
      ...metadata,
    };

    super(response, statusCode);
  }
}

export class CsvImportException extends ValidationException {
  constructor(
    error: string,
    message: string,
    metadata: Record<string, any> = {},
  ) {
    super(HttpStatus.UNPROCESSABLE_ENTITY, error, message, metadata);
  }
}
