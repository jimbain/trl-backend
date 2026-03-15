import { Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ExtractJwt } from 'passport-jwt';
import { UserService } from 'src/users/user.service';
import { ConfigService } from '@nestjs/config';
import { DomainValidationService } from './services/domain-validation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly domainValidationService: DomainValidationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const user = await this.userService.findById(payload.id, ['company']);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user is active
    // if (!user.is_active) {
    //   throw new UnauthorizedException(
    //     'Your account is inactive. Please contact your administrator.',
    //   );
    // }

    // Check if company is active
    // if (user.company && !user.company.is_active) {
    //   throw new UnauthorizedException(
    //     'Your company account is inactive. Please contact your administrator.',
    //   );
    // }

    // Domain Validation (pass entire request for Origin header access)
    this.domainValidationService.validateDomain(req, user);

    return user;
  }
}
