import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-oauth2';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service'; // Create this service to handle tokens

@Injectable()
export class OktaStrategy extends PassportStrategy(Strategy, 'okta') {
  constructor(
    private configService: ConfigService,
    private authService: AuthService, // Service to handle token validation and user management
  ) {
    super({
      authorizationURL: `${configService.getOrThrow<string>('OKTA_ISSUER_URL')}/v1/authorize`,
      tokenURL: `${configService.getOrThrow<string>('OKTA_ISSUER_URL')}/v1/token`,
      clientID: configService.getOrThrow<string>('OKTA_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('OKTA_CLIENT_SECRET'),
      callbackURL: configService.getOrThrow<string>('OKTA_CALLBACK_URL'),
      scope: configService.getOrThrow<string>('OKTA_SCOPE'),
      state: true,
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any, done: VerifyCallback) {
    // Handle the user info and validation logic here
    const user = await this.authService.validateOktaUser(profile, accessToken);
    done(null, user);
  }
}
