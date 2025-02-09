import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminUser } from '../entities/admin_user.entity';

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

  async login(user: AdminUser) {
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
      user: user,
    };
  }
}
