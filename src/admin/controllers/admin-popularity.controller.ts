import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ListPopularityDto } from 'src/popularity/dto/list-popularity.dto';
import { PopularityService } from 'src/popularity/services/popularity.service';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/popularity')
export class AdminPopularityController {
  constructor(private readonly popularityService: PopularityService) {}

  @Get()
  list(@Query() query: ListPopularityDto) {
    return this.popularityService.list(query);
  }

  @Get('status')
  status() {
    return this.popularityService.getStatus();
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  async regenerate() {
    const run = await this.popularityService.triggerManual();
    return { batch_id: run.batch_id, run_id: run.id, status: run.status };
  }

  @Get('export')
  async export(@Res() res: Response): Promise<void> {
    const filename = `popularity_scores_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await this.popularityService.streamCsv((chunk) => res.write(chunk));
    res.end();
  }

  @Get(':sku')
  getOne(@Param('sku') sku: string) {
    return this.popularityService.getOne(sku);
  }
}
