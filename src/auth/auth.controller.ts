import { Controller, Request, Post, UseGuards, Body, UnauthorizedException, Get, HttpCode } from '@nestjs/common';
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
  @HttpCode(200)
  async signup(@Body() registerPayload: RegisterDto) {
    const user = await this.authService.signup(registerPayload);
    return {
      message: 'Registered successfully',
      data: {
        user,
      },
    };
  }

  @Post('check-user')
  async checkUser(@Body() checkUserDto: CheckUserDto) {
    return { 
      message: 'User exists',
      data: {
        user: await this.authService.checkUser(checkUserDto.email)
      }
    };
  }

  @Post('login')
  async login(@Body() loginPayload: LoginDto) {
    const user = await this.authService.validateUser(loginPayload);
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      message: 'Logged in successfully.',
      data: await this.authService.login(user)
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh-token')
  async refreshToken(@Request() req, @Body() refreshTokenPayload: RefreshTokenDto) {
    return {
      message: 'The token has been successfully refreshed.',
      data: await this.authService.refreshToken(refreshTokenPayload.refresh_token, req.user)
    };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() payload: ForgotPasswordDto) {
    return {
      message: 'Otp has been sent to email',
      data:{
        otp: await this.authService.sendOtp(payload.email)
      }
    }
  }

  @Post('forgot-password/verify-otp')
  async verifyForgotPasswordOtp(@Body() payload: ForgotPasswordOtpVerifyDto) {
    return {
      message: 'Otp has been verified',
      data:{
        token: await this.authService.getForgotPasswordTokenFromOtp(payload.otp)
      }
    }
  }

  @Post('reset-password')
  async resetPassword(@Body() payload: ResetPasswordDto) {
    await this.authService.resetPassword(payload.token, payload.password);

    return {
      message: 'Password reset successfully.'
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return {
      data: {
        user: req.user
      }
    }
  }
}
