import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../entities/admin_user.entity';
import { AdminChangePasswordDto } from '../dto/auth/admin-change-password.dto';
import { AdminLoginDto } from '../dto/auth/admin-login.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminUserRepository: Repository<AdminUser>,

    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async findUserByEmail(email: string): Promise<AdminUser | undefined> {
    const user = await this.adminUserRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(`Admin user with email ${email} not found`);
    }

    return user;
  }

  async validateLogin(user: AdminUser, password: string) {
    if (user && (await bcrypt.compare(password, user.password))) {
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

  async login(payload: AdminLoginDto) {
    const user = await this.findUserByEmail(payload.email);
    await this.validateLogin(user, payload.password);

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
      user: {
        name: user.name,
        email: user.email,
      },
    };
  }

  async changePassword(user: AdminUser, payload: AdminChangePasswordDto) {
    await this.validateLogin(user, payload.password);

    // Validate if new password and confirmation match
    if (payload.new_password !== payload.password_confirmation) {
      throw new HttpException(
        {
          errors: {
            password_confirmation: ["Password confirmation doesn't match"],
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    user.password = payload.new_password;
    await this.adminUserRepository.save(user);
  }
}
