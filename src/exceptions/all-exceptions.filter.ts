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
      // Create a flattened errors object
      const flattenedErrors = this.flattenErrors(message.errors);

      // Extract the first error message for the main message
      let firstErrorMessage = 'Validation failed';

      // Try to find the first actual error message in the flattened structure
      if (flattenedErrors) {
        // Check direct fields first
        for (const field in flattenedErrors) {
          if (typeof flattenedErrors[field] === 'string') {
            firstErrorMessage = flattenedErrors[field];
            break;
          }
        }

        // If no direct field message, look in nested objects
        if (firstErrorMessage === 'Validation failed') {
          for (const field in flattenedErrors) {
            if (typeof flattenedErrors[field] === 'object') {
              for (const nestedIndex in flattenedErrors[field]) {
                if (typeof flattenedErrors[field][nestedIndex] === 'object') {
                  for (const nestedField in flattenedErrors[field][
                    nestedIndex
                  ]) {
                    if (
                      typeof flattenedErrors[field][nestedIndex][
                        nestedField
                      ] === 'string'
                    ) {
                      firstErrorMessage =
                        flattenedErrors[field][nestedIndex][nestedField];
                      break;
                    }
                  }
                  if (firstErrorMessage !== 'Validation failed') break;
                }
              }
              if (firstErrorMessage !== 'Validation failed') break;
            }
          }
        }
      }

      // Format the response
      response.status(status).json({
        message: firstErrorMessage,
        errors: flattenedErrors,
      });
    } else {
      // For all other status codes, send the default message
      response.status(status).json({
        message: message?.message ?? message,
      });
    }
  }

  /**
   * Flattens the nested error structure
   */
  private flattenErrors(errors: any): any {
    const result: any = {};

    // Process each top-level field
    for (const field in errors) {
      if (Array.isArray(errors[field])) {
        // Handle simple array case like quantity: ["error message"]
        if (typeof errors[field][0] === 'string') {
          result[field] = errors[field][0];
        }
        // Handle nested errors like ingredients: [{ errors: {...} }]
        else if (typeof errors[field][0] === 'object') {
          // Check if it's the nested array format with errors property
          if (errors[field][0].errors) {
            result[field] = {};

            // Process each element in the nested array
            for (const nestedField in errors[field][0].errors) {
              const nestedErrors = errors[field][0].errors[nestedField];

              if (Array.isArray(nestedErrors)) {
                // Process each nested error object
                nestedErrors.forEach((nestedError: any, index: number) => {
                  if (nestedError.errors) {
                    if (!result[field][nestedField]) {
                      result[field][nestedField] = {};
                    }

                    // Extract flat structure from nested errors
                    for (const deepField in nestedError.errors) {
                      result[field][nestedField][deepField] = Array.isArray(
                        nestedError.errors[deepField],
                      )
                        ? nestedError.errors[deepField][0]
                        : nestedError.errors[deepField];
                    }
                  }
                });
              }
            }
          }
        }
      }
    }

    return result;
  }
}
