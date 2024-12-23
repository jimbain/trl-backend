import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Strategy } from '@node-saml/passport-saml';

@Injectable()
export class OktaStrategy extends PassportStrategy(Strategy, 'saml') {
  constructor(private readonly configService: ConfigService) {
    super({
      entryPoint: configService.get<string>('SAML_ENTRY_POINT'), // SSO URL
      issuer: configService.get<string>('SAML_ISSUER'), // Issuer
      callbackUrl: configService.get<string>('SAML_CALLBACK_URL'), // Callback URL
      idpCert: configService.get<string>('SAML_CERTIFICATE'), // Certificate
    });
  }

  validate(profile: any) {
    return {
      id: profile.nameID,
      email: profile['email'] || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'],
      firstName: profile['firstName'] || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'],
      lastName: profile['lastName'] || profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'],
    };
  }
}
