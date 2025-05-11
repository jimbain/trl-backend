import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AppErrorLogService } from 'src/app-error-log/app-error-log.service';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/users')
export class AdminAppErrorLogController {
  constructor(private readonly appErrorLogService: AppErrorLogService) {}

  @UseGuards(JwtAdminAuthGuard)
  @Get()
  findAll(@Query() query: any = {}) {
    return this.appErrorLogService.findAll(query);
  }
}
