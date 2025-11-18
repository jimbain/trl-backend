import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from 'src/users/user.module';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordResetToken } from 'src/auth/entities/password_reset_token.entity';
import { CommonModule } from 'src/common/common.module';
import { AppConfig } from 'src/app-config/entities/app-config.entity';
import { HttpModule } from '@nestjs/axios';
import { OktaStrategy } from './okta.strategy';
import { CompanyModule } from 'src/companies/company.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PasswordResetToken, AppConfig]),
    UserModule,
    CommonModule,
    HttpModule,
    forwardRef(() => CompanyModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      global: true,
      useFactory: async (config: ConfigService) => ({
        global: true,
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: config.getOrThrow<string>('JWT_ACCESS_TOKEN_EXPIRES_IN'),
          algorithm: 'HS384',
        },
        verifyOptions: {
          algorithms: ['HS384'],
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, OktaStrategy, JwtStrategy],
})
export class AuthModule {}
