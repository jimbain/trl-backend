import {
    IsEmail,
    IsNotEmpty,
    IsString,
} from 'class-validator';
import { IsExist } from 'src/validation/validators/is-exist.validator';
import { User } from 'src/user/entities/user.entity';

export class VerifyCurrentPasswordDto {
    @IsString()
    @IsEmail()
    @IsNotEmpty()
    @IsExist(User, 'email', { message: 'Email does not exist' })
    email: string;
    
    @IsString()
    @IsNotEmpty()
    password: string;
}
