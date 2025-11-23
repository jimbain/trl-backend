import { PassportStrategy } from '@nestjs/passport';
import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { MultiSamlStrategy } from '@node-saml/passport-saml';
import { CompanyService } from 'src/companies/company.service';
import { COMPANY_LOGIN_TYPE } from 'src/constants';

@Injectable()
export class DynamicSamlStrategy extends PassportStrategy(
  MultiSamlStrategy,
  'saml',
) {
  constructor(private readonly companyService: CompanyService) {
    super({
      passReqToCallback: true,
      getSamlOptions: async (req, callback) => {
        try {
          // Extract company ID from route params
          const companyId = req.params?.companyId;

          if (!companyId) {
            return callback(
              new BadRequestException('Company ID is required'),
              null,
            );
          }

          // Fetch company from database
          const company = await this.companyService.findById(companyId);

          if (!company) {
            return callback(
              new NotFoundException(`Company with ID ${companyId} not found`),
              null,
            );
          }

          // Validate company has SSO enabled
          if (company.login_type !== COMPANY_LOGIN_TYPE.SSO) {
            return callback(
              new BadRequestException(
                'Company does not support SSO login. Please use credential-based login.',
              ),
              null,
            );
          }

          // Validate SSO config exists
          if (!company.sso_config) {
            return callback(
              new Error(
                'SSO configuration is missing for this company. Please contact support.',
              ),
              null,
            );
          }

          const ssoConfig = company.sso_config as any;

          // Validate all required SSO config fields
          const requiredFields = [
            'saml_entry_point',
            'saml_issuer',
            'saml_callback_url',
            'saml_audience_url',
            'saml_certificate',
          ];

          for (const field of requiredFields) {
            if (!ssoConfig[field]) {
              return callback(
                new Error(
                  `SSO configuration is incomplete: missing ${field}. Please contact support.`,
                ),
                null,
              );
            }
          }

          // Store company context in request for later use
          req.company = company;

          // Return SAML configuration
          callback(null, {
            entryPoint: ssoConfig.saml_entry_point,
            issuer: ssoConfig.saml_audience_url,
            callbackUrl: ssoConfig.saml_callback_url,
            cert: ssoConfig.saml_certificate,
            idpCert: ssoConfig.saml_certificate, // Required by @node-saml/passport-saml
            audience: ssoConfig.saml_audience_url,
          });
        } catch (error) {
          callback(error, null);
        }
      },
    });
  }

  async validate(req: any, profile: any) {
    const ssoConfig = req.company?.sso_config as any;

    if (!profile) {
      throw new UnauthorizedException('Invalid SAML profile received.');
    }

    // Validate issuer matches
    if (!profile.issuer || profile.issuer !== ssoConfig?.saml_issuer) {
      console.error(
        `Invalid issuer: Expected ${ssoConfig?.saml_issuer}, got ${profile.issuer}`,
      );
      throw new UnauthorizedException('Invalid SAML issuer.');
    }

    // Extract user information from SAML profile
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
      companyId: req.company.id,
    };
  }
}
