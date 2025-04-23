import {
  Controller,
  Get,
  UseGuards,
  Param,
  Query,
  Patch,
  Body,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminAudioService } from '../services/admin-audio.service';
import { AdminUpdateAudioDto } from '../dto/audio/admin-update-audio.dto';
import { QueryAdminAudioDto } from '../dto/audio/query-admin-audio.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/audios')
export class AdminAudioController {
  constructor(private readonly adminAudioService: AdminAudioService) {}

  @Get()
  findAll(@Query() query: QueryAdminAudioDto) {
    return this.adminAudioService.findAll(query);
  }

  @Get(':id')
  show(@Param('id') id: string) {
    return this.adminAudioService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() payload: AdminUpdateAudioDto) {
    return this.adminAudioService.update(id, payload);
  }
}
