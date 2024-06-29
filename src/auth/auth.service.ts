import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserService } from 'src/user/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';
import { User } from 'src/user/entities/user.entity';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,

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

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      if ( ! payload.isRefreshToken ) {
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
}
