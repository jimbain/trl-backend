import { HttpException, HttpStatus } from "@nestjs/common";
import { ValidationError } from "class-validator";


export const validationExceptionFactory = (errors: ValidationError[]) => {
    const formatError = (errors: ValidationError[]) => {
        const errMsg = {};
        errors.forEach((error: ValidationError) => {
            errMsg[error.property] = error.children.length
                ? [formatError(error.children)]
                : [...Object.values(error.constraints)];
        });

        return { errors: errMsg };
    };
    return new ValidationException(formatError(errors));
};

export class ValidationException extends HttpException {
    constructor(public validationErrors: Record<string, unknown>) {
        super(validationErrors, HttpStatus.UNPROCESSABLE_ENTITY);
    }
}