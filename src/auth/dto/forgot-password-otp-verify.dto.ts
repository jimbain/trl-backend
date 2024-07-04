import {
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { IsExist } from 'src/validation/validators/is-exist.validator';
import { PasswordResetToken } from '../entities/password-reset-token.entity';

export class ForgotPasswordOtpVerifyDto {
    // @IsString()
    // @IsNotEmpty()
    // user_id: string;
    
    @IsString()
    @IsNotEmpty()
    @IsExist(PasswordResetToken, 'otp', { message: 'Invalid otp.' })
    otp: string;
}
