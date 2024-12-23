import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    console.log(exception)
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message: any =
      exception instanceof HttpException ? exception.getResponse() : exception;

    // Handle 422 Unprocessable Entity status code
    if (
      status === HttpStatus.UNPROCESSABLE_ENTITY &&
      typeof message === 'object' &&
      message.errors
    ) {
      // Extract the first error message from the errors object
      const firstErrorField = Object.keys(message.errors)[0];
      const firstErrorMessage = message.errors[firstErrorField][0];

      // Format the response
      response.status(status).json({
        message: firstErrorMessage,
        errors: message.errors,
      });
    } else {
      // For all other status codes, send the default message
      response.status(status).json({
        message: message,
      });
    }
  }
}
