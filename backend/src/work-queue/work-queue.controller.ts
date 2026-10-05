import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WorkQueueService } from './work-queue.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('work-queue')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkQueueController {
  constructor(private readonly workQueueService: WorkQueueService) {}

  @Get('tasks')
  async getTasks(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: string,
    @Query('regionCode') regionCode?: string,
    @Query('priority') priority?: string,
  ) {
    return this.workQueueService.getTasks(user, {
      status,
      regionCode,
      priority,
    });
  }

  @Get('tasks/:id')
  async getTaskById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.workQueueService.getTaskById(Number(id), user);
  }

  @Post('tasks/:id/execute')
  async executeTaskAction(
    @Param('id') id: string,
    @Body() body: { action: string; comments?: string; meta?: any },
    @CurrentUser() user: AuthUser,
  ) {
    return this.workQueueService.executeTaskAction(Number(id), body, user);
  }
}
