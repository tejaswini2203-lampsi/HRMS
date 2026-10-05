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
import { EmployeeService } from './employee.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get()
  async findAll(
    @CurrentUser() user?: AuthUser,
    @Query('subsidiary') subsidiary?: string,
  ) {
    return this.employeeService.findAll(user, subsidiary);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.employeeService.findById(Number(id), user);
  }

  @Post()
  @Roles('HR', 'ADMIN')
  async create(@Body() dto: CreateEmployeeDto) {
    return this.employeeService.create(dto);
  }

  @Patch(':id/deactivate')
  @Roles('HR', 'ADMIN')
  async deactivate(@Param('id') id: string) {
    return this.employeeService.deactivate(Number(id));
  }

  @Patch(':id')
  @Roles('HR', 'ADMIN')
  async update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeeService.update(Number(id), dto);
  }
}
