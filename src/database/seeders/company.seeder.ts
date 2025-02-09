import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { RemoveOptions, Repository, SaveOptions } from 'typeorm';
import { Company } from 'src/companies/entities/company.entity';
import { faker } from '@faker-js/faker';
import { COMPANY_LOGIN_TYPE, MEDIA, Media } from 'src/constants';
import { Catalog } from 'src/catalog/entities/catalog.entity';

@Injectable()
export class CompanySeeder {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,

    @InjectRepository(Catalog)
    private readonly catalogRepository: Repository<Catalog>,
  ) {}

  async seed() {
    console.log(
      '###########################  COMPANY SEEDING START  ###########################',
    );

    const catalogs = await this.catalogRepository.find({
      where: {
        is_active: true,
      },
      select: ['id'],
    });

    const companies = [
      {
        name: 'Demo company',
        logo_url:
          'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTZK6pfDrScY1Jvt0xxdSAxy8Rz8XodxJa9A&s',
        is_active: true,
        domain: `https://biz1.trainingresourcelibrary.com`,
        description: faker.company.catchPhrase(),
        login_type: COMPANY_LOGIN_TYPE.CREDENTIALS,
        sso_config: null,
        available_medias: [MEDIA.AUDIO, MEDIA.VIDEO, MEDIA.PHARMA],
        catalogs: catalogs.map((catalog) => catalog?.id) ?? [],
        contacts: [],
        available_credits: 100,
        phone: '+14075551234',
        address1: '123 Main St',
        address2: 'Apt 4B',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        country: 'USA',
      },
      {
        name: 'SSO company',
        logo_url:
          'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTGHswFnSZCKj-TS6p7zWuaCz2PtbEkgPshKg&s',
        is_active: true,
        domain: `https://biz2.trainingresourcelibrary.com`,
        description: faker.company.catchPhrase(),
        login_type: COMPANY_LOGIN_TYPE.SSO,
        sso_config: {
          provider: 'okta',
          saml_entry_point:
            'https://dev-23885463.okta.com/app/dev-23885463_trllocalsamlapp_1/exkm38q2mj0b2Wee65d7/sso/saml',
          saml_issuer: 'http://www.okta.com/exkm38q2mj0b2Wee65d7',
          saml_callback_url: 'http://localhost/api/v1/auth/okta/callback',
          saml_audience_url: 'http://localhost/api/v1/auth/okta',
          saml_certificate:
            'MIIDqDCCApCgAwIBAgIGAZPzgNjsMA0GCSqGSIb3DQEBCwUAMIGUMQswCQYDVQQGEwJVUzETMBEGA1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2FuIEZyYW5jaXNjbzENMAsGA1UECgwET2t0YTEUMBIGA1UECwwLU1NPUHJvdmlkZXIxFTATBgNVBAMMDGRldi0yMzg4NTQ2MzEcMBoGCSqGSIb3DQEJARYNaW5mb0Bva3RhLmNvbTAeFw0yNDEyMjMxMjMxMDdaFw0zNDEyMjMxMjMyMDdaMIGUMQswCQYDVQQGEwJVUzETMBEGA1UECAwKQ2FsaWZvcm5pYTEWMBQGA1UEBwwNU2FuIEZyYW5jaXNjbzENMAsGA1UECgwET2t0YTEUMBIGA1UECwwLU1NPUHJvdmlkZXIxFTATBgNVBAMMDGRldi0yMzg4NTQ2MzEcMBoGCSqGSIb3DQEJARYNaW5mb0Bva3RhLmNvbTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAL4P3wZywbW799Wxn6s6pjzCi3mDn9DR5lTfAcgYkfWw3ZQkrDxl2LDOOV6dZ4qn4zkBwBf7phz2Qe6zdW+7KwcnARsWpd1+PLayFMRAWce0KxVjY/g0bqTedfUiuZrKF7UJyoGwdci1xl57v0zWqd0a0bbcnYY2/C9G7KA90Oiv/bsmv3bE0WYnK64tgpqXRLz5Dn7z9mWni50EA5K7rvqeBo0TQcIXCvRXNbaEs95YE61lMwcUikR6+WB2noMZX1uriYykrB5I/jOH7u3a7UDZW5W6wFXYWox3Ef4Je7/vesgZ/T67/9+Xh9vIR4q2fX94U5+7Wt2afr7I4Iig6/sCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAtxjj7MUjaYUQSJYMbKLczYFoZ/XpAuwCm7JpyFosKj0lnqNIUnOZHqvnGoTYEoSOyE9dfj3cqZCmAfZY4ACspg51LRZoH+anZA1FLZFDDRI+kJI/dZibITraoE2yPP3fv2LXE5afnY/dKJRrSDYc72uzgWwkRaLONbD9dbj0Z++67MqW+8TusVEvSmZvnb/yYBUU49bJH+kHMAIUBUEHv1gOlKkRIjmtyH3yvNZYPJA3MI/3L5omosjtMJoHwuq2G1cOpHJmwQoqzKkGIHrW57hZq2/hj7mu6Nu661MpCFz1LG0DDMgWTA5kkJ2DnuJpoZJOpHZvGxI+boH4aTulEA==',
        },
        available_medias: [MEDIA.AUDIO, MEDIA.VIDEO, MEDIA.PHARMA],
        catalogs: catalogs.map((catalog) => catalog?.id) ?? [],
        contacts: [],
        available_credits: 100,
        phone: '+13125556789',
        address1: '456 Elm Ave',
        address2: 'Suite 200',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90012',
        country: 'USA',
      },
    ];

    for (const companyData of companies) {
      const company = this.companyRepository.create(companyData);
      await this.companyRepository.save(company);
    }

    console.log(
      '###########################  COMPANY SEEDING END  ###########################',
    );
  }
}
