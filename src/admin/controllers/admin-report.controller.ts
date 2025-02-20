import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAdminAuthGuard } from '../guards/jwt-admin-auth.guard';
import { AdminReportService } from '../services/admin-report.service';

@UseGuards(JwtAdminAuthGuard)
@Controller('admin/reports')
export class AdminReportController {
  constructor(private readonly adminReportService: AdminReportService) {}

  @Get('overview')
  findOverview() {
    return this.adminReportService.getOverview();
  }

  @Get('usage')
  findUsage() {
    return this.adminReportService.getUsage();
  }
}
