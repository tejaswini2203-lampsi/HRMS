import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { PassportService } from './passport.service';
import { CreatePassportDto } from './dto/create-passport.dto';
import { UpdatePassportDto } from './dto/update-passport.dto';

@Controller('passports')
export class PassportController {
  constructor(private readonly passportService: PassportService) {}

  @Get('alerts')
  async findAlerts() {
    return this.passportService.findAllAlerts();
  }

  @Get(':empId')
  async findByEmpId(@Param('empId') empId: string) {
    return this.passportService.findByEmpId(empId);
  }

  @Post()
  async create(@Body() dto: CreatePassportDto) {
    return this.passportService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdatePassportDto) {
    return this.passportService.update(Number(id), dto);
  }
}
