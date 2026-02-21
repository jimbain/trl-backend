import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExtractJwt } from 'passport-jwt';
import { UserService } from 'src/users/user.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.userService.findById(payload.id, ['company']);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is active
    if (!user.is_active) {
      throw new UnauthorizedException(
        'Your account is inactive. Please contact your administrator.',
      );
    }

    // Check if company is active
    if (user.company && !user.company.is_active) {
      throw new UnauthorizedException(
        'Your company account is inactive. Please contact your administrator.',
      );
    }

    return user;
  }
}
