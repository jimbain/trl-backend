import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/pharmas')
export class AdminPharmaController {
  constructor() {}

  @Get()
  findAll(@Query() query: any) {
    return [];
  }
}
