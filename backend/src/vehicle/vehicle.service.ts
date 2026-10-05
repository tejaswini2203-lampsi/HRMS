import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmployeeService } from '../employee/employee.service';
import {
  optionalDateString,
  parsePositiveInt,
  requireDateString,
  requireNonEmptyString,
} from '../common/validation.util';
import { CreateVehicleAllocationDto } from './dto/create-vehicle-allocation.dto';
import { UpdateVehicleAllocationDto } from './dto/update-vehicle-allocation.dto';
import { NotificationService } from '../notification/notification.service';

export interface VehicleAllocationRecord {
  AllocationID: number;
  EmpID: number;
  VehicleNumber: string;
  VehicleType: string;
  AllocatedFrom: Date;
  AllocatedTo: Date | null;
  IsActive: boolean;
}

const VEHICLE_SELECT = `
  AllocationID,
  EmpID,
  VehicleNumber,
  VehicleType,
  AllocatedFrom,
  AllocatedTo,
  IsActive
`;

@Injectable()
export class VehicleService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly employeeService: EmployeeService,
    private readonly notificationService: NotificationService,
  ) {}

  async findByEmpId(
    empIdParam: string | number,
  ): Promise<VehicleAllocationRecord[]> {
    const empId = parsePositiveInt(empIdParam, 'empId');

    return this.databaseService.query<VehicleAllocationRecord>(
      `
        SELECT ${VEHICLE_SELECT}
        FROM VehicleAllocation
        WHERE EmpID = @empId
        ORDER BY AllocationID DESC;
      `,
      { empId },
    );
  }

  async findById(id: number): Promise<VehicleAllocationRecord> {
    const allocationId = parsePositiveInt(id, 'id');
    const allocation =
      await this.databaseService.queryOne<VehicleAllocationRecord>(
        `
          SELECT ${VEHICLE_SELECT}
          FROM VehicleAllocation
          WHERE AllocationID = @allocationId;
        `,
        { allocationId },
      );

    if (!allocation) {
      throw new NotFoundException('Vehicle allocation not found');
    }

    return allocation;
  }

  async create(
    dto: CreateVehicleAllocationDto,
  ): Promise<VehicleAllocationRecord> {
    const empId = parsePositiveInt(dto.empId, 'empId');
    const vehicleNumber = requireNonEmptyString(
      dto.vehicleNumber,
      'vehicleNumber',
      100,
    );
    const vehicleType = requireNonEmptyString(
      dto.vehicleType,
      'vehicleType',
      100,
    );
    const allocatedFrom = requireDateString(dto.allocatedFrom, 'allocatedFrom');
    const allocatedTo = optionalDateString(dto.allocatedTo, 'allocatedTo');
    const isActive = dto.isActive === undefined ? true : Boolean(dto.isActive);

    if (allocatedTo !== null && allocatedTo < allocatedFrom) {
      throw new BadRequestException(
        'allocatedTo cannot be earlier than allocatedFrom',
      );
    }

    await this.ensureEmployeeExists(empId);

    if (isActive) {
      await this.closeActiveAllocations(empId);
    }

    const created =
      await this.databaseService.queryOne<VehicleAllocationRecord>(
        `
          INSERT INTO VehicleAllocation (
            EmpID,
            VehicleNumber,
            VehicleType,
            AllocatedFrom,
            AllocatedTo,
            IsActive
          )
          OUTPUT
            INSERTED.AllocationID,
            INSERTED.EmpID,
            INSERTED.VehicleNumber,
            INSERTED.VehicleType,
            INSERTED.AllocatedFrom,
            INSERTED.AllocatedTo,
            INSERTED.IsActive
          VALUES (
            @empId,
            @vehicleNumber,
            @vehicleType,
            @allocatedFrom,
            @allocatedTo,
            @isActive
          );
        `,
        {
          empId,
          vehicleNumber,
          vehicleType,
          allocatedFrom,
          allocatedTo,
          isActive,
        },
      );

    if (!created) {
      throw new BadRequestException('Failed to create vehicle allocation');
    }

    await this.notifyAllocation(created, 'allocated');
    return created;
  }

  async update(
    id: number,
    dto: UpdateVehicleAllocationDto,
  ): Promise<VehicleAllocationRecord> {
    const allocationId = parsePositiveInt(id, 'id');
    const existing = await this.findById(allocationId);

    if (!existing.IsActive) {
      throw new BadRequestException('Cannot edit a closed vehicle allocation');
    }

    const empId =
      dto.empId !== undefined
        ? parsePositiveInt(dto.empId, 'empId')
        : existing.EmpID;
    const vehicleNumber =
      dto.vehicleNumber !== undefined
        ? requireNonEmptyString(dto.vehicleNumber, 'vehicleNumber', 100)
        : existing.VehicleNumber;
    const vehicleType =
      dto.vehicleType !== undefined
        ? requireNonEmptyString(dto.vehicleType, 'vehicleType', 100)
        : existing.VehicleType;
    const allocatedFrom =
      dto.allocatedFrom !== undefined
        ? requireDateString(dto.allocatedFrom, 'allocatedFrom')
        : this.toDateOnly(existing.AllocatedFrom);
    const allocatedTo =
      dto.allocatedTo !== undefined
        ? optionalDateString(dto.allocatedTo, 'allocatedTo')
        : existing.AllocatedTo
          ? this.toDateOnly(existing.AllocatedTo)
          : null;

    if (allocatedTo !== null && allocatedTo < allocatedFrom) {
      throw new BadRequestException(
        'allocatedTo cannot be earlier than allocatedFrom',
      );
    }

    if (dto.empId !== undefined) {
      await this.ensureEmployeeExists(empId);
    }

    const updated =
      await this.databaseService.queryOne<VehicleAllocationRecord>(
        `
          UPDATE VehicleAllocation
          SET
            EmpID = @empId,
            VehicleNumber = @vehicleNumber,
            VehicleType = @vehicleType,
            AllocatedFrom = @allocatedFrom,
            AllocatedTo = @allocatedTo
          OUTPUT
            INSERTED.AllocationID,
            INSERTED.EmpID,
            INSERTED.VehicleNumber,
            INSERTED.VehicleType,
            INSERTED.AllocatedFrom,
            INSERTED.AllocatedTo,
            INSERTED.IsActive
          WHERE AllocationID = @allocationId;
        `,
        {
          allocationId,
          empId,
          vehicleNumber,
          vehicleType,
          allocatedFrom,
          allocatedTo,
        },
      );

    if (!updated) {
      throw new NotFoundException('Vehicle allocation not found');
    }

    return updated;
  }

  async close(id: number): Promise<VehicleAllocationRecord> {
    const allocationId = parsePositiveInt(id, 'id');
    const existing = await this.findById(allocationId);

    if (!existing.IsActive) {
      throw new BadRequestException('Vehicle allocation is already closed');
    }

    const updated =
      await this.databaseService.queryOne<VehicleAllocationRecord>(
        `
          UPDATE VehicleAllocation
          SET
            IsActive = 0,
            AllocatedTo = CASE
              WHEN AllocatedTo IS NULL THEN CAST(GETDATE() AS date)
              ELSE AllocatedTo
            END
          OUTPUT
            INSERTED.AllocationID,
            INSERTED.EmpID,
            INSERTED.VehicleNumber,
            INSERTED.VehicleType,
            INSERTED.AllocatedFrom,
            INSERTED.AllocatedTo,
            INSERTED.IsActive
          WHERE AllocationID = @allocationId;
        `,
        { allocationId },
      );

    if (!updated) {
      throw new NotFoundException('Vehicle allocation not found');
    }

    return updated;
  }

  private async notifyAllocation(
    allocation: VehicleAllocationRecord,
    action: string,
  ): Promise<void> {
    try {
      const employee = await this.employeeService.findById(allocation.EmpID);
      const name = [employee.FirstName, employee.MiddleName, employee.LastName]
        .filter(Boolean)
        .join(' ');
      const fromDate = this.toDateOnly(allocation.AllocatedFrom);
      const targets = await this.notificationService.findUsersByEmpId(
        allocation.EmpID,
      );
      await this.notificationService.notify({
        targets,
        type: 'VEHICLE_ALLOCATED',
        title: 'Vehicle allocated',
        message: `${name}, vehicle ${allocation.VehicleNumber} (${allocation.VehicleType}) was ${action} from ${fromDate}. Status: Active.`,
        relatedEntity: 'VehicleAllocation',
        relatedEntityId: Number(allocation.AllocationID),
      });
    } catch {
      // Notification failure must not block allocation
    }
  }

  private toDateOnly(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async closeActiveAllocations(empId: number): Promise<void> {
    await this.databaseService.query(
      `
        UPDATE VehicleAllocation
        SET
          IsActive = 0,
          AllocatedTo = CASE
            WHEN AllocatedTo IS NULL THEN CAST(GETDATE() AS date)
            ELSE AllocatedTo
          END
        WHERE EmpID = @empId
          AND IsActive = 1;
      `,
      { empId },
    );
  }

  private async ensureEmployeeExists(empId: number): Promise<void> {
    const exists = await this.employeeService.exists(empId);
    if (!exists) {
      throw new BadRequestException('empId does not reference a valid employee');
    }
  }
}
