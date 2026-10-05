export class UpdateVehicleAllocationDto {
  empId?: number;
  vehicleNumber?: string;
  vehicleType?: string;
  allocatedFrom?: string;
  allocatedTo?: string | null;
}
