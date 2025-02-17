import { Module, forwardRef } from '@nestjs/common';
import { AdminAuthController } from './controllers/admin-auth.controller';
import { AdminAuthService } from './services/admin-auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from './entities/admin_user.entity';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtAdminStrategy } from './strategies/jwt-admin.strategy';
import { JwtAdminAuthGuard } from './guards/jwt-admin-auth.guard';
import { CompanyModule } from 'src/companies/company.module';
import { AdminCompanyController } from './controllers/admin-company.controller';
import { AppConfigModule } from 'src/app-config/app-config.module';
import { AdminConfigurationController } from './controllers/admin-configuration.controller';
import { CatalogModule } from 'src/catalog/catalog.module';
import { CategoryModule } from 'src/categories/category.module';
import { AdminCatalogController } from './controllers/admin-catalog.controller';
import { AdminCompanyUserController } from './controllers/admin-company-user.controller';
import { UserModule } from 'src/users/user.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.getOrThrow<string>(
            'JWT_ACCESS_TOKEN_EXPIRES_IN',
          ),
          algorithm: 'HS384',
        },
        verifyOptions: {
          algorithms: ['HS384'],
        },
      }),
    }),
    TypeOrmModule.forFeature([AdminUser]),
    forwardRef(() => CompanyModule),
    forwardRef(() => CatalogModule),
    forwardRef(() => CategoryModule),
    forwardRef(() => AppConfigModule),
    forwardRef(() => UserModule),
  ],
  controllers: [
    AdminAuthController,
    AdminCompanyController,
    AdminConfigurationController,
    AdminCatalogController,
    AdminCompanyUserController,
  ],
  providers: [AdminAuthService, JwtAdminStrategy, JwtAdminAuthGuard],
  exports: [AdminAuthService, JwtAdminAuthGuard],
})
export class AdminModule {}
