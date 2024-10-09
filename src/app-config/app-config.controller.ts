import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AppConfigService } from './app-config.service';
import { CreateAppConfigDto } from './dto/create-app-config.dto';
import { UpdateAppConfigDto } from './dto/update-app-config.dto';

@Controller('app-config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Post()
  create(@Body() createAppConfigDto: CreateAppConfigDto) {
    return this.appConfigService.create(createAppConfigDto);
  }

  @Get()
  findAll() {
    return this.appConfigService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.appConfigService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateAppConfigDto: UpdateAppConfigDto) {
    return this.appConfigService.update(+id, updateAppConfigDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.appConfigService.remove(+id);
  }
}
