import { Controller, Get, Body, Patch, UseGuards } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AppConfigService } from 'src/app-config/app-config.service';
import { UpdateAppConfigDto } from 'src/app-config/dto/update-app-config.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/configurations')
export class AdminConfigurationController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get()
  findAll() {
    return this.appConfigService.findAll();
  }

  @Patch()
  signup(@Body() payload: UpdateAppConfigDto) {
    return this.appConfigService.update(payload);
  }
}
