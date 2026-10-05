import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SlaService } from './sla.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('sla')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get('rules')
  async getRules(
    @Query('eventCode') eventCode?: string,
    @Query('regionCode') regionCode?: string,
  ) {
    if (eventCode) {
      return this.slaService.getRulesByEvent(eventCode, regionCode);
    }
    return this.slaService.getAllRules();
  }
}
