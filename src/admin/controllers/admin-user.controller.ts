import { Controller, UseGuards, Post, Body } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { UserService } from 'src/users/user.service';
import { QueryUserDto } from 'src/users/dto/query-user.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Post('list')
  findAll(@Body() payload: QueryUserDto) {
    payload.is_basic = true;
    return this.userService.findAll(payload);
  }
}
