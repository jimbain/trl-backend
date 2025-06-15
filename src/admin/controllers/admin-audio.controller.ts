import {
  Controller,
  Get,
  UseGuards,
  Param,
  Query,
  Patch,
  Body,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminAudioService } from '../services/admin-audio.service';
import { AdminUpdateAudioDto } from '../dto/audio/admin-update-audio.dto';
import { QueryAdminAudioDto } from '../dto/audio/query-admin-audio.dto';
import { AdminBulkUpdateAudioDto } from '../dto/audio/admin-bulk-update-audio.dto';
import { Response } from 'express';
// import { AdminAudioMeiliSearchService } from '../services/admin-audio-meilisearch.service';
import { AdminAudioElasticsearchService } from '../services/admin-audio-elasticsearch.service';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/audios')
export class AdminAudioController {
  constructor(
    private readonly adminAudioService: AdminAudioService,
    // private readonly adminAudioMeiliSearchService: AdminAudioMeiliSearchService,
    private readonly adminAudioElasticsearchService: AdminAudioElasticsearchService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryAdminAudioDto, @Res() res: Response) {
    const result = await this.adminAudioElasticsearchService.findAll(query);

    if (result instanceof StreamableFile) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="audios.csv"`);

      result.getStream().pipe(res);
    } else {
      res.status(200).send(result);
    }
  }

  @Get(':id')
  show(@Param('id') id: string) {
    return this.adminAudioService.findOne(id);
  }

  @Patch('bulk-update')
  bulkUpdate(@Body() payload: AdminBulkUpdateAudioDto) {
    return this.adminAudioService.bulkUpdate(payload);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() payload: AdminUpdateAudioDto) {
    return this.adminAudioService.update(id, payload);
  }
}
