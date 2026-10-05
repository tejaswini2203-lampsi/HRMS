import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('compliance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('stats')
  async getStats(
    @CurrentUser() user: AuthUser,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.complianceService.getStats(user, regionCode);
  }

  @Get('config')
  async getConfig() {
    return this.complianceService.getComplianceConfig();
  }

  @Get('cases')
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('regionCode') regionCode?: string,
    @Query('status') status?: string,
    @Query('eventCode') eventCode?: string,
    @Query('priority') priority?: string,
    @Query('assignedRole') assignedRole?: string,
    @Query('period') period?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: 'ASC' | 'DESC',
    @Query('empId') empId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.complianceService.findAll({
      regionCode,
      status,
      eventCode,
      priority,
      assignedRole,
      period,
      search,
      sort,
      order,
      empId: empId ? Number(empId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      user,
    });
  }

  @Get('cases/:id')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.complianceService.findById(Number(id), user);
  }

  @Post('cases')
  async createCase(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.complianceService.createCase({
      ...body,
      user,
    });
  }

  @Patch('cases/:id/advance')
  async advanceStage(
    @Param('id') id: string,
    @Body('action') action: string,
    @Body('comments') comments: string,
    @Body('meta') meta: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.complianceService.advanceStage(
      Number(id),
      action,
      comments,
      meta,
      user,
    );
  }

  @Patch('cases/:id/checklist/:progressId')
  @Roles('HR', 'ADMIN')
  async updateChecklistItem(
    @Param('id') id: string,
    @Param('progressId') progressId: string,
    @Body('isCompleted') isCompleted: boolean,
    @Body('documentId') documentId: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.complianceService.updateChecklistItem(
      Number(id),
      Number(progressId),
      isCompleted,
      documentId,
      user,
    );
  }

  @Post('scan')
  @Roles('HR', 'ADMIN')
  async scanExpiries() {
    return this.complianceService.scanExpiries();
  }
}
