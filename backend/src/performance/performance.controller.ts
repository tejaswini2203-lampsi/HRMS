import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('performance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  @Get('overview')
  async getOverview(@CurrentUser() user: AuthUser) {
    return this.performanceService.getOverview(user);
  }

  @Get('employees/:empId/comments')
  async getComments(
    @Param('empId') empId: string,
    @Query('sentiment') sentiment?: string,
    @Query('weight') weight?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('author') author?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.performanceService.getComments(Number(empId), user!, {
      sentiment,
      weight,
      fromDate,
      toDate,
      author,
    });
  }

  @Post('employees/:empId/comments')
  async addComment(
    @Param('empId') empId: string,
    @Body()
    body: {
      comment: string;
      sentiment: string;
      weight?: string;
      priority?: string;
    },
    @CurrentUser() user: AuthUser,
  ) {
    return this.performanceService.addComment(Number(empId), body, user);
  }
}
