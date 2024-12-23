import {
  Controller,
  Request,
  Post,
  UseGuards,
  Body,
  Get,
  HttpCode,
  Res,
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
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

  @Get('okta')
  @UseGuards(AuthGuard('saml'))
  samlLogin() {
    // Redirects to Okta SAML login page
  }

  @Post('okta/callback')
  @UseGuards(AuthGuard('saml'))
  async samlCallback(@Request() req, @Res() res) {
    const tokens = await this.authService.getTokensForOktaSsoLoginThroughEmail(
      req.user.id,
    );
    const frontendUrl = this.config.getOrThrow<string>('FRONTEND_APP_URL');
    res.redirect(
      `${frontendUrl}/okta-signin?access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token}`,
    );
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

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @HttpCode(200)
  getProfile(@Request() req) {
    return {
      user: req.user,
    };
  }
}
