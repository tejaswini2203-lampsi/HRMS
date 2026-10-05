import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('HR', 'ADMIN')
  async findAll(
    @Query('module') module?: string,
    @Query('recordId') recordId?: string,
    @Query('empId') empId?: string,
    @Query('regionCode') regionCode?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.findAll({
      module,
      recordId,
      empId: empId ? Number(empId) : undefined,
      regionCode,
      limit: limit ? Number(limit) : 100,
    });
  }
}
