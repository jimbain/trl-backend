import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserService } from 'src/users/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/users/entities/user.entity';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { PasswordResetToken } from 'src/auth/entities/password_reset_token.entity';
import { Repository } from 'typeorm';
import { TokenService } from 'src/common/services/token.service';
import { plainToInstance } from 'class-transformer';
import { UserDto } from 'src/users/dto/user.dto';
import { MailgunService } from 'src/common/services/mailgun.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly mailgunService: MailgunService,
  ) {}

  async signup(registerPayload: RegisterDto) {
    return this.userService.create(registerPayload);
  }

  async validateUser(loginPayload: LoginDto): Promise<any> {
    const user = await this.userService.findByEmail(loginPayload.email, [
      'company',
    ]);

    if (user && (await bcrypt.compare(loginPayload.password, user.password))) {
      const { password, ...result } = user;
      return result;
    }

    throw new HttpException(
      {
        errors: {
          password: ["Password doesn't match"],
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  async checkUser(email: string): Promise<any> {
    const user = await this.userService.findByEmail(email);
    return plainToInstance(UserDto, user, { excludeExtraneousValues: true });
  }

  async login(user: User) {
    const accessPayload: JwtPayload = {
      id: user.id,
      email: user.email,
      isRefreshToken: false,
    };
    const refreshPayload: JwtPayload = {
      id: user.id,
      email: user.email,
      isRefreshToken: true,
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TOKEN_EXPIRES_IN'),
    });
    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TOKEN_EXPIRES_IN'),
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: plainToInstance(UserDto, user, { excludeExtraneousValues: true }),
    };
  }

  async refreshToken(token: string, reqestedUser: User) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      if (!payload.isRefreshToken || reqestedUser.id !== payload.id) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.userService.findById(payload.id);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return this.login(user);
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async sendForgotPasswordOtp(email: string) {
    const user = await this.userService.findByEmail(email);

    const token = new PasswordResetToken();
    token.user = user;
    token.token = this.tokenService.generateRandomToken();
    token.otp = this.tokenService.generateRandomOtp();
    token.otp_type = 'email';
    token.expires_at = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    this.passwordResetTokenRepository.save(token);

    await this.mailgunService.sendEmail(
      user.email,
      'Forgot Password OTP',
      this.mailgunService.getOtpEmailTemplate(token.otp),
    );
  }

  async getForgotPasswordTokenFromOtp(
    email: string,
    otp: string,
  ): Promise<string> {
    const user = await this.userService.findByEmail(email);

    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { otp: otp, user: { id: user.id } },
      order: { created_at: 'DESC' },
    });

    return resetToken.token;
  }

  async verifyCurrentPassword(
    email: string,
    password: string,
  ): Promise<string> {
    const user = await this.userService.findByEmail(email);

    if (user && (await bcrypt.compare(password, user.password))) {
      const token = new PasswordResetToken();
      token.user = user;
      token.token = this.tokenService.generateRandomToken();
      token.otp_type = 'email';
      token.expires_at = new Date(Date.now() + 3600 * 1000); // 1 hour from now

      await this.passwordResetTokenRepository.save(token);

      return token.token;
    }

    throw new HttpException(
      {
        errors: {
          password: ["Password doesn't match"],
        },
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ success: boolean }> {
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { token },
      order: { created_at: 'DESC' },
      relations: ['user'],
    });

    await this.userService.changePassword(resetToken.user, password);

    return { success: true };
  }
}
