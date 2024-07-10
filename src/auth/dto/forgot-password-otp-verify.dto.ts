import {
    IsEmail,
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { IsExist } from 'src/validation/validators/is-exist.validator';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { User } from 'src/user/entities/user.entity';

export class ForgotPasswordOtpVerifyDto {
    @IsString()
    @IsEmail()
    @IsNotEmpty()
    @IsExist(User, 'email', { message: 'Email does not exist' })
    email: string;
    
    @IsString()
    @IsNotEmpty()
    @IsExist(PasswordResetToken, 'otp', { message: 'Invalid otp.' })
    otp: string;
}
