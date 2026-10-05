import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { ApproveLeaveDto } from './dto/approve-leave.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

@Controller('leaves')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  async findAll(@Query('empId') empId?: string) {
    return this.leaveService.findAll(empId);
  }

  @Post()
  async create(@Body() dto: CreateLeaveDto) {
    return this.leaveService.create(dto);
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body() dto: ApproveLeaveDto) {
    return this.leaveService.approve(Number(id), dto);
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string, @Body() dto: RejectLeaveDto) {
    return this.leaveService.reject(Number(id), dto);
  }

  @Patch(':id/cancel')
  async cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.leaveService.cancel(Number(id), user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLeaveDto) {
    return this.leaveService.update(Number(id), dto);
  }
}
