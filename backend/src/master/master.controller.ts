import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MasterService } from './master.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('masters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MasterController {
  constructor(private readonly masterService: MasterService) {}

  @Get('regions')
  async getRegions() {
    return this.masterService.getRegions();
  }

  @Get('entities')
  async getEntities(@Query('regionCode') regionCode?: string) {
    return this.masterService.getEntities(regionCode);
  }

  @Get('event-types')
  async getEventTypes(@Query('regionCode') regionCode?: string) {
    return this.masterService.getEventTypes(regionCode);
  }

  @Get('pipelines')
  async getPipelines(@Query('regionCode') regionCode?: string) {
    return this.masterService.getPipelines(regionCode);
  }

  @Get('pipeline-stages')
  async getPipelineStages(@Query('pipelineCode') pipelineCode?: string) {
    return this.masterService.getPipelineStages(pipelineCode);
  }

  @Get('closure-checklists')
  async getClosureChecklists(@Query('pipelineCode') pipelineCode?: string) {
    return this.masterService.getClosureChecklistItems(pipelineCode);
  }

  @Get('approval-chains')
  async getApprovalChains(
    @Query('requestTypeCode') requestTypeCode?: string,
    @Query('regionCode') regionCode?: string,
  ) {
    return this.masterService.getApprovalChains(requestTypeCode, regionCode);
  }

  @Get('request-types')
  async getRequestTypes() {
    return this.masterService.getRequestTypes();
  }

  @Get('letter-templates')
  async getLetterTemplates(@Query('regionCode') regionCode?: string) {
    return this.masterService.getLetterTemplates(regionCode);
  }

  @Patch('letter-templates/:id')
  @Roles('HR', 'ADMIN')
  async updateLetterTemplate(
    @Param('id') id: string,
    @Body('content') content: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.masterService.updateLetterTemplate(Number(id), content, user);
  }

  @Get('configs')
  async getSystemConfigs() {
    return this.masterService.getSystemConfigs();
  }

  @Patch('configs/:key')
  @Roles('ADMIN')
  async updateSystemConfig(
    @Param('key') key: string,
    @Body('value') value: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.masterService.updateSystemConfig(key, value, user);
  }
}
