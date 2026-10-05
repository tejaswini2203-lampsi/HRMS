export class CreateVehicleAllocationDto {
  empId!: number;
  vehicleNumber!: string;
  vehicleType!: string;
  allocatedFrom!: string;
  allocatedTo?: string | null;
  isActive?: boolean;
}
