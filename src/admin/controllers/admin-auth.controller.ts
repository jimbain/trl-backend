import {
  Controller,
  Post,
  Body,
  HttpCode,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLoginDto } from '../dto/auth/admin-login.dto';
import { AdminChangePasswordDto } from '../dto/auth/admin-change-password.dto';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() payload: AdminLoginDto) {
    return this.adminAuthService.login(payload);
  }

  @UseGuards(JwtAdminAuthGuard)
  @Post('change-password')
  @HttpCode(200)
  async changePassword(@Req() req, @Body() payload: AdminChangePasswordDto) {
    return this.adminAuthService.changePassword(req.user, payload);
  }
}
