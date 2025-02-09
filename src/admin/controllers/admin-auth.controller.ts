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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/users/user.service';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLoginDto } from '../dto/auth/admin-login.dto';

@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly config: ConfigService,
    private readonly userService: UserService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() payload: AdminLoginDto) {
    const user = await this.adminAuthService.findUserByEmail(payload.email);
    return this.adminAuthService.login(user);
  }
}
