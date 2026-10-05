import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { CreateVehicleAllocationDto } from './dto/create-vehicle-allocation.dto';
import { UpdateVehicleAllocationDto } from './dto/update-vehicle-allocation.dto';

@Controller('vehicle-allocations')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Get(':empId')
  async findByEmpId(@Param('empId') empId: string) {
    return this.vehicleService.findByEmpId(empId);
  }

  @Post()
  async create(@Body() dto: CreateVehicleAllocationDto) {
    return this.vehicleService.create(dto);
  }

  @Patch(':id/close')
  async close(@Param('id') id: string) {
    return this.vehicleService.close(Number(id));
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateVehicleAllocationDto,
  ) {
    return this.vehicleService.update(Number(id), dto);
  }
}
