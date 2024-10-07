import { IsNotEmpty, IsString } from 'class-validator';
import { IsExist } from 'src/validation/validators/is-exist.validator';
import { PasswordResetToken } from 'src/auth/entities/password_reset_token.entity';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @IsExist(PasswordResetToken, 'token', { message: 'Invalid token' })
  token: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
