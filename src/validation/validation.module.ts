import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IsUniqueConstraint } from './validators/is-unique.validator';
import { IsExistConstraint } from './validators/is-exist.validator';
import { IsBasicAuthCompanyUserConstraint } from './validators/is_basic_auth_company_user.validator';

@Module({
  imports: [TypeOrmModule.forFeature()],
  providers: [
    IsExistConstraint,
    IsUniqueConstraint,
    IsBasicAuthCompanyUserConstraint,
  ],
  exports: [
    IsExistConstraint,
    IsUniqueConstraint,
    IsBasicAuthCompanyUserConstraint,
  ],
})
export class ValidationModule {}
