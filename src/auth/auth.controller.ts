import { Controller, Request, Post, UseGuards, Body, UnauthorizedException, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() registerPayload: RegisterDto) {
    return this.authService.signup(registerPayload);
  }

  @Post('login')
  async login(@Body() loginPayload: LoginDto) {
    return loginPayload;
    const user = await this.authService.validateUser(loginPayload);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.authService.login(user);
  }

  @Post('refresh-token')
  async refreshToken(@Body() refreshTokenPayload: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenPayload.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    return req.user;
  }
}
