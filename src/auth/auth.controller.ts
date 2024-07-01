import { Controller, Request, Post, UseGuards, Body, UnauthorizedException, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { CheckUserDto } from './dto/check-user.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ForgotPasswordOtpVerifyDto } from './dto/forgot-password-otp-verify.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() registerPayload: RegisterDto) {
    return this.authService.signup(registerPayload);
  }

  @Post('check-user')
  async checkUser(@Body() checkUserDto: CheckUserDto): Promise<{ exists: boolean }> {
    return { exists: true };
  }

  @Post('login')
  async login(@Body() loginPayload: LoginDto) {
    const user = await this.authService.validateUser(loginPayload);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.authService.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh-token')
  async refreshToken(@Request() req, @Body() refreshTokenPayload: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenPayload.refresh_token, req.user);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    return this.authService.sendOtp(payload.email);
  }

  @Post('forgot-password/verify-otp')
  async verifyForgotPasswordOtp(@Body() payload: ForgotPasswordOtpVerifyDto) {
    return this.authService.getForgotPasswordTokenFromOtp(payload.otp);
  }

  @Post('reset-password')
  async resetPassword(@Body() payload: ResetPasswordDto) {
    return this.authService.resetPassword(payload.token, payload.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
