import {
    IsNotEmpty,
    IsString,
    IsEmail,
} from 'class-validator';
import { User } from 'src/user/entities/user.entity';
import { IsExist } from 'src/validation/validators/is-exist.validator';

export class LoginDto {
    @IsString()
    @IsEmail()
    @IsNotEmpty()
    @IsExist(User, 'email', { message: 'Email does not exist' })
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;
}
