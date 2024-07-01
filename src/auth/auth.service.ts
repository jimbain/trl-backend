import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserService } from 'src/user/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/user/entities/user.entity';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { Repository } from 'typeorm';
import { TokenService } from 'src/common/services/token.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,


  ) {}

  async signup(registerPayload: RegisterDto) {
    return this.userService.create(registerPayload);
  }

  async validateUser(loginPayload: LoginDto): Promise<any> {
    const user = await this.userService.findByEmail(loginPayload.email);
    if (user && await bcrypt.compare(loginPayload.password, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }


  async login(user: User) {
    const accessPayload: JwtPayload = { id: user.id, email: user.email, isRefreshToken: false };
    const refreshPayload: JwtPayload = { id: user.id, email: user.email, isRefreshToken: true };

    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: this.config.getOrThrow<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') });
    const refreshToken = this.jwtService.sign(refreshPayload, { expiresIn: this.config.getOrThrow<string>('JWT_REFRESH_TOKEN_EXPIRES_IN') });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async refreshToken(token: string, reqestedUser: User) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      if ( ! payload.isRefreshToken  || reqestedUser.id !== payload.id ) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.userService.findById(payload.id);

      if ( ! user ) {
        throw new UnauthorizedException('User not found');
      }

      return this.login(user);
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async sendOtp(email: string): Promise<{ otp: string }>{
    const user = await this.userService.findByEmail(email);

    const token = new PasswordResetToken();
    token.user = user;
    token.token = this.tokenService.generateRandomToken();
    token.otp = this.tokenService.generateRandomOtp();
    token.expired_at = new Date(Date.now() + 3600 * 1000); // 1 hour from now

    this.passwordResetTokenRepository.save(token);

    return { otp: token.otp };
  }
  
  async getForgotPasswordTokenFromOtp(otp: string): Promise<{token: string}>{
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { otp },
      order: { created_at: 'DESC' },
    });
    
    return { token: resetToken.token };
  }

  async resetPassword(token: string, password: string): Promise<{success: boolean}>{
    const resetToken = await this.passwordResetTokenRepository.findOne({
      where: { token },
      order: { created_at: 'DESC' },
      relations: ['user'],
    });

    await this.userService.changePassword(resetToken.user, password);
    
    return { success: true };
  }
}
