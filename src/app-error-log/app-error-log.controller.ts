import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AppErrorLogService } from './app-error-log.service';
import { CreateAppErrorLogDto } from './dto/create-app-error-log.dto';
import { MobileAppApiKeyAuthGuard } from 'src/common/guards/mobile-app-api-key-auth.guard';

@Controller('app-error-logs')
export class AppErrorLogController {
  constructor(private readonly appErrorLogService: AppErrorLogService) {}

  @UseGuards(MobileAppApiKeyAuthGuard)
  @Post()
  create(@Body() createAppErrorLogDto: CreateAppErrorLogDto) {
    return this.appErrorLogService.create(createAppErrorLogDto);
  }
}
