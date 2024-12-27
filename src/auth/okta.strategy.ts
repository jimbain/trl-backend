import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Strategy } from '@node-saml/passport-saml';

@Injectable()
export class OktaStrategy extends PassportStrategy(Strategy, 'saml') {
  constructor(private readonly configService: ConfigService) {
    super({
      entryPoint: configService.getOrThrow<string>('SAML_ENTRY_POINT'), // SSO URL
      issuer: configService.getOrThrow<string>('SAML_AUDIENCE_URL'), // Issuer
      callbackUrl: configService.getOrThrow<string>('SAML_CALLBACK_URL'), // Callback URL
      idpCert: configService.getOrThrow<string>('SAML_CERTIFICATE'), // Certificate
    });
  }

  validate(profile: any) {
    const validIssuer = this.configService.getOrThrow<string>('SAML_ISSUER');

    if (!profile) {
      throw new UnauthorizedException('Invalid SAML profile received.');
    }

    if (!profile.issuer || profile.issuer !== validIssuer) {
      console.error(
        `Invalid issuer: Expected ${validIssuer}, got ${profile.issuer}`,
      );
      throw new UnauthorizedException('Invalid SAML issuer.');
    }

    return {
      id: profile.nameID,
      email:
        profile['email'] ||
        profile[
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'
        ],
      firstName:
        profile['firstName'] ||
        profile[
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'
        ],
      lastName:
        profile['lastName'] ||
        profile[
          'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'
        ],
    };
  }
}
