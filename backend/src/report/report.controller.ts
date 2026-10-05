import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('compliance-status')
  @Roles('HR', 'ADMIN')
  async getComplianceStatus(@Query('regionCode') regionCode?: string) {
    return this.reportService.getComplianceStatus(regionCode);
  }

  @Get('overdue-compliance')
  @Roles('HR', 'ADMIN')
  async getOverdueCompliance(@Query('regionCode') regionCode?: string) {
    return this.reportService.getOverdueCompliance(regionCode);
  }

  @Get('sla-breaches')
  @Roles('HR', 'ADMIN')
  async getSLABreaches(@Query('regionCode') regionCode?: string) {
    return this.reportService.getSLABreaches(regionCode);
  }

  @Get('work-queue-summary')
  @Roles('HR', 'ADMIN')
  async getWorkQueueSummary(@Query('regionCode') regionCode?: string) {
    return this.reportService.getWorkQueueSummary(regionCode);
  }

  @Get('ksa-iqama-costs')
  @Roles('HR', 'ADMIN')
  async getKsaIqamaCosts() {
    return this.reportService.getKsaIqamaCosts();
  }

  @Get('advance-requests')
  @Roles('HR', 'ADMIN')
  async getAdvanceRequestsSummary(@Query('regionCode') regionCode?: string) {
    return this.reportService.getAdvanceRequestsSummary(regionCode);
  }

  @Get('letter-requests')
  @Roles('HR', 'ADMIN')
  async getLetterRequestsSummary(@Query('regionCode') regionCode?: string) {
    return this.reportService.getLetterRequestsSummary(regionCode);
  }
}
