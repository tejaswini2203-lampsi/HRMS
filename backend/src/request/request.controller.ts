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
import { RequestService } from './request.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RequestController {
  constructor(private readonly requestService: RequestService) {}

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('requestType') requestType?: string,
    @Query('status') status?: string,
    @Query('regionCode') regionCode?: string,
    @Query('empId') empId?: string,
  ) {
    return this.requestService.findAll(user, {
      requestType,
      status,
      regionCode,
      empId: empId ? Number(empId) : undefined,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.requestService.findById(Number(id), user);
  }

  @Post()
  async createRequest(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.requestService.createRequest(body, user);
  }

  @Patch(':id/approval')
  async processApproval(
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; remarks?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.requestService.processApproval(Number(id), body, user);
  }
}
