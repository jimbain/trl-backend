import {
  Controller,
  Request,
  Post,
  UseGuards,
  Body,
  Get,
  HttpCode,
  Res,
  Query,
  Param,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CheckUserDto } from './dto/check-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ForgotPasswordOtpVerifyDto } from './dto/forgot-password-otp-verify.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyCurrentPasswordDto } from './dto/verify-current-password.dto';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/users/user.service';
import { CompanyService } from 'src/companies/company.service';
import { COMPANY_LOGIN_TYPE } from 'src/constants';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly userService: UserService,
    private readonly companyService: CompanyService,
  ) {}

  @Post('signup')
  @HttpCode(200)
  async signup(@Body() registerPayload: RegisterDto) {
    return this.authService.signup(registerPayload);
  }

  @Post('check-user')
  @HttpCode(200)
  async checkUser(@Body() checkUserDto: CheckUserDto) {
    return this.authService.checkUser(checkUserDto.email);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() loginPayload: LoginDto) {
    const user = await this.authService.validateUser(loginPayload);
    this.authService.storeLoginInfo(user, loginPayload);
    return this.authService.login(user);
  }

  @Get('sso/:companyId')
  @UseGuards(AuthGuard('saml'))
  ssoLogin(@Param('companyId') companyId: string) {
    // Redirects to company-specific Okta SAML login page
  }

  @Post('sso/callback/:companyId')
  @UseGuards(AuthGuard('saml'))
  async ssoCallback(
    @Param('companyId') companyId: string,
    @Request() req,
    @Res() res,
  ) {
    const user = await this.userService.findByEmail(req.user.email, [
      'company',
    ]);

    if (!user) {
      return res.redirect(
        `/api/v1/auth/sso/callback/${companyId}/error?message=User does not exist`,
      );
    }

    // Validate user belongs to the company
    if (user.company_id !== companyId) {
      return res.redirect(
        `/api/v1/auth/sso/callback/${companyId}/error?message=User does not belong to this company`,
      );
    }

    if (user.company.login_type !== COMPANY_LOGIN_TYPE.SSO) {
      return res.redirect(
        `/api/v1/auth/sso/callback/${companyId}/error?message=Company does not have SSO login enabled`,
      );
    }

    const tokens = await this.authService.login(user);
    res.redirect(
      `/api/v1/auth/sso/callback/${companyId}/success?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`,
    );
  }

  @Get('sso/callback/:companyId/success')
  async ssoCallbackSuccess(
    @Param('companyId') companyId: string,
    @Query('access_token') accessToken: string,
    @Query('refresh_token') refreshToken: string,
    @Res() res,
  ) {
    // Get company to retrieve the frontend domain
    const company = await this.companyService.findById(companyId);

    // Use company's domain if available, otherwise fall back to first FRONTEND_APP_URL
    let frontendUrl: string;
    if (company?.domain) {
      frontendUrl = company.domain;
    } else {
      const frontendUrls = this.config.getOrThrow<string>('FRONTEND_APP_URL');
      frontendUrl = frontendUrls.split(',')[0].trim();
    }

    res.redirect(
      `${frontendUrl}/sso-signin?access_token=${accessToken}&refresh_token=${refreshToken}`,
    );
  }

  @Get('sso/callback/:companyId/error')
  async ssoCallbackError(
    @Param('companyId') companyId: string,
    @Query('message') message: string,
    @Res() res,
  ) {
    // Get company to retrieve the frontend domain
    const company = await this.companyService.findById(companyId);

    // Use company's domain if available, otherwise fall back to first FRONTEND_APP_URL
    let frontendUrl: string;
    if (company?.domain) {
      frontendUrl = company.domain;
    } else {
      const frontendUrls = this.config.getOrThrow<string>('FRONTEND_APP_URL');
      frontendUrl = frontendUrls.split(',')[0].trim();
    }

    res.redirect(`${frontendUrl}/sso-signin?message=${message}`);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh-token')
  @HttpCode(200)
  async refreshToken(
    @Request() req,
    @Body() refreshTokenPayload: RefreshTokenDto,
  ) {
    return {
      message: 'The token has been successfully refreshed.',
      data: await this.authService.refreshToken(
        refreshTokenPayload.refresh_token,
        req.user,
      ),
    };
  }

  @Post('forgot-password/send-otp')
  @HttpCode(200)
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    return await this.authService.sendForgotPasswordOtp(payload.email);
  }

  @Post('forgot-password/verify-otp')
  @HttpCode(200)
  async verifyForgotPasswordOtp(@Body() payload: ForgotPasswordOtpVerifyDto) {
    return {
      token: await this.authService.getForgotPasswordTokenFromOtp(
        payload.email,
        payload.otp,
      ),
    };
  }

  @Post('change-password/verify-current-password')
  @HttpCode(200)
  async verifyCurrentPassword(@Body() payload: VerifyCurrentPasswordDto) {
    return {
      token: await this.authService.verifyCurrentPassword(
        payload.email,
        payload.password,
      ),
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() payload: ResetPasswordDto) {
    await this.authService.resetPassword(payload.token, payload.password);
    return;
  }
}
