import {
  Controller,
  Get,
  UseGuards,
  Query,
  Res,
  StreamableFile,
  Post,
  Body,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminVideoService } from '../services/admin-video.service';
import { Response } from 'express';
import { AdminCreateVideoDto } from '../dto/video/admin-create-video.dto';
import { AdminUpdateVideoDto } from '../dto/video/admin-update-video.dto';
import { QueryAdminVideoDto } from '../dto/video/query-admin-video.dto';
import { AdminBulkUpdateVideoDto } from '../dto/video/admin-bulk-update-video.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/videos')
export class AdminVideoController {
  constructor(private readonly adminVideoService: AdminVideoService) {}

  @Get()
  async findAll(@Query() query: QueryAdminVideoDto, @Res() res: Response) {
    const result = await this.adminVideoService.findAll(query);

    if (result instanceof StreamableFile) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="videos.csv"`);

      result.getStream().pipe(res);
    } else {
      res.status(200).send(result);
    }
  }

  @Post()
  create(@Body() payload: AdminCreateVideoDto) {
    return this.adminVideoService.create(payload);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminVideoService.findOne(id);
  }

  @Patch('bulk-update')
  bulkUpdate(@Body() payload: AdminBulkUpdateVideoDto) {
    return this.adminVideoService.bulkUpdate(payload);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() payload: AdminUpdateVideoDto) {
    return this.adminVideoService.update(id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.adminVideoService.remove(id);
  }
}
