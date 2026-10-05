import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { FlightService } from './flight.service';
import { CreateFlightTicketDto } from './dto/create-flight-ticket.dto';
import { UpdateFlightTicketDto } from './dto/update-flight-ticket.dto';

@Controller('flight-tickets')
export class FlightController {
  constructor(private readonly flightService: FlightService) {}

  @Get(':empId')
  async findByEmpId(@Param('empId') empId: string) {
    return this.flightService.findByEmpId(empId);
  }

  @Post()
  async create(@Body() dto: CreateFlightTicketDto) {
    return this.flightService.create(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateFlightTicketDto) {
    return this.flightService.update(Number(id), dto);
  }
}
