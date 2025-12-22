import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  StreamableFile,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminReportService } from '../services/admin-report.service';
import { Response } from 'express';
import { AdminReportUserActivityLogsQueryDto } from '../dto/report/admin-report-user-activity-log-query.dto';
import { AdminQueuedTitlesQueryDto } from '../dto/queue/admin-queued-titles-query.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/reports')
export class AdminReportController {
  constructor(private readonly adminReportService: AdminReportService) {}

  @Get('overview')
  findOverview() {
    return this.adminReportService.getOverview();
  }

  @Post('user-activity-logs')
  async findUserActivityLogs(
    @Body() payload: AdminReportUserActivityLogsQueryDto,
    @Res() res: Response,
  ) {
    const result = await this.adminReportService.getUserActivityLogs(payload);

    if (result instanceof StreamableFile) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report.csv"`);

      result.getStream().pipe(res);
    } else {
      res.status(200).send(result);
    }
  }

  @Get('queued-titles')
  async getQueuedTitles(@Query() query: AdminQueuedTitlesQueryDto) {
    return this.adminReportService.getQueuedTitles(query);
  }
}
