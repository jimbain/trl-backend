import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AppErrorLogService } from './app-error-log.service';
import { CreateAppErrorLogDto } from './dto/create-app-error-log.dto';
import { JwtAdminAuthGuard } from 'src/admin/guards/jwt-admin-auth.guard';
import { MobileAppApiKeyAuthGuard } from 'src/common/guards/mobile-app-api-key-auth.guard';

@Controller('app-error-logs')
export class AppErrorLogController {
  constructor(private readonly appErrorLogService: AppErrorLogService) {}

  @UseGuards(JwtAdminAuthGuard)
  @Get()
  findAll(@Query() query: any = {}) {
    return this.appErrorLogService.findAll(query);
  }

  @UseGuards(MobileAppApiKeyAuthGuard)
  @Post()
  create(@Body() createAppErrorLogDto: CreateAppErrorLogDto) {
    return this.appErrorLogService.create(createAppErrorLogDto);
  }
}
