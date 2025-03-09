import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/videos')
export class AdminVideoController {
  constructor() {}

  @Get()
  findAll(@Query() query: any) {
    return [];
  }
}
