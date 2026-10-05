import { Body, Controller, Get, Post } from '@nestjs/common';
import { DepartmentService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get()
  async findAll() {
    return this.departmentService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }
}
