import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminReportService } from '../services/admin-report.service';
import { Response } from 'express';
import { AdminReportGetUserActivityLogsQueryDto } from '../dto/report/admin-report-get-user-activity-log-query.dto';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/reports')
export class AdminReportController {
  constructor(private readonly adminReportService: AdminReportService) {}

  @Get('overview')
  findOverview() {
    return this.adminReportService.getOverview();
  }

  @Get('user-activity-logs')
  async findUserActivityLogs(
    @Query() query: AdminReportGetUserActivityLogsQueryDto = {},
    @Res() res: Response,
  ) {
    const result = await this.adminReportService.getUserActivityLogs(query);

    if (result instanceof StreamableFile) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report.csv"`);

      result.getStream().pipe(res);
    } else {
      res.status(200).send(result);
    }
  }
}
