import {
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { IsExist } from 'src/validation/validators/is-exist.validator';
import { PasswordResetToken } from '../entities/password-reset-token.entity';

export class ResetPasswordDto {
    @IsString()
    @IsNotEmpty()
    @IsExist(PasswordResetToken, 'token', { message: 'Invalid token' })
    token: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}
