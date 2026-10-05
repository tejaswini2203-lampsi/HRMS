import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EmployeeService } from '../employee/employee.service';
import { NotificationService } from '../notification/notification.service';
import {
  optionalLeaveDayType,
  optionalPositiveInt,
  optionalString,
  parsePositiveInt,
  requireDateString,
  requireLeaveDayType,
  requireNonEmptyString,
} from '../common/validation.util';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { ApproveLeaveDto } from './dto/approve-leave.dto';
import { RejectLeaveDto } from './dto/reject-leave.dto';
import { AuthUser } from '../auth/auth.types';

export interface LeaveRecord {
  LeaveID: number;
  EmpID: number;
  LeaveType: string;
  FromDate: Date;
  ToDate: Date;
  Status: string;
  InitiatedBy: number | null;
  InitiatedRole: string | null;
  HODApprovedBy: number | null;
  HRApprovedBy: number | null;
  Remarks: string | null;
  LeaveDayType: string;
  CreatedAt: Date;
}

const LEAVE_SELECT = `
  LeaveID,
  EmpID,
  LeaveType,
  FromDate,
  ToDate,
  Status,
  InitiatedBy,
  InitiatedRole,
  HODApprovedBy,
  HRApprovedBy,
  Remarks,
  LeaveDayType,
  CreatedAt
`;

const LEAVE_OUTPUT = `
  INSERTED.LeaveID,
  INSERTED.EmpID,
  INSERTED.LeaveType,
  INSERTED.FromDate,
  INSERTED.ToDate,
  INSERTED.Status,
  INSERTED.InitiatedBy,
  INSERTED.InitiatedRole,
  INSERTED.HODApprovedBy,
  INSERTED.HRApprovedBy,
  INSERTED.Remarks,
  INSERTED.LeaveDayType,
  INSERTED.CreatedAt
`;

const FINAL_STATUSES = new Set(['HR Approved', 'Rejected', 'Cancelled']);

@Injectable()
export class LeaveService {
  private readonly logger = new Logger(LeaveService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly employeeService: EmployeeService,
    private readonly notificationService: NotificationService,
  ) {}

  async findAll(empId?: string): Promise<LeaveRecord[]> {
    if (empId !== undefined && empId !== null && String(empId).trim() !== '') {
      const parsedEmpId = parsePositiveInt(empId, 'empId');
      return this.databaseService.query<LeaveRecord>(
        `
          SELECT ${LEAVE_SELECT}
          FROM LeaveRequest
          WHERE EmpID = @empId
          ORDER BY CreatedAt DESC, LeaveID DESC;
        `,
        { empId: parsedEmpId },
      );
    }

    return this.databaseService.query<LeaveRecord>(`
      SELECT ${LEAVE_SELECT}
      FROM LeaveRequest
      ORDER BY CreatedAt DESC, LeaveID DESC;
    `);
  }

  async findById(id: number): Promise<LeaveRecord> {
    const leaveId = parsePositiveInt(id, 'id');
    const leave = await this.databaseService.queryOne<LeaveRecord>(
      `
        SELECT ${LEAVE_SELECT}
        FROM LeaveRequest
        WHERE LeaveID = @leaveId;
      `,
      { leaveId },
    );

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    return leave;
  }

  async create(dto: CreateLeaveDto): Promise<LeaveRecord> {
    const empId = parsePositiveInt(dto.empId, 'empId');
    const leaveType = requireNonEmptyString(dto.leaveType, 'leaveType', 100);
    const fromDate = requireDateString(dto.fromDate, 'fromDate');
    const toDate = requireDateString(dto.toDate, 'toDate');
    const leaveDayType = requireLeaveDayType(dto.leaveDayType);
    const initiatedBy = optionalPositiveInt(dto.initiatedBy, 'initiatedBy');
    const initiatedRole = optionalString(dto.initiatedRole, 'initiatedRole', 50);
    const remarks = optionalString(dto.remarks, 'remarks', 1000);

    if (toDate < fromDate) {
      throw new BadRequestException('toDate cannot be earlier than fromDate');
    }

    await this.ensureEmployeeExists(empId, 'empId');

    if (initiatedBy !== null) {
      await this.ensureEmployeeExists(initiatedBy, 'initiatedBy');
    }

    const created = await this.databaseService.queryOne<LeaveRecord>(
      `
        INSERT INTO LeaveRequest (
          EmpID,
          LeaveType,
          FromDate,
          ToDate,
          Status,
          InitiatedBy,
          InitiatedRole,
          Remarks,
          LeaveDayType
        )
        OUTPUT
          ${LEAVE_OUTPUT}
        VALUES (
          @empId,
          @leaveType,
          @fromDate,
          @toDate,
          @status,
          @initiatedBy,
          @initiatedRole,
          @remarks,
          @leaveDayType
        );
      `,
      {
        empId,
        leaveType,
        fromDate,
        toDate,
        status: 'Pending',
        initiatedBy,
        initiatedRole,
        remarks,
        leaveDayType,
      },
    );

    if (!created) {
      throw new BadRequestException('Failed to create leave request');
    }

    await this.notifyLeaveSubmitted(created);
    return created;
  }

  async update(id: number, dto: UpdateLeaveDto): Promise<LeaveRecord> {
    const leaveId = parsePositiveInt(id, 'id');
    const existing = await this.findById(leaveId);

    if (FINAL_STATUSES.has(existing.Status)) {
      throw new BadRequestException(
        `Cannot update a leave request with status ${existing.Status}`,
      );
    }

    const leaveDayTypeUpdate = optionalLeaveDayType(dto.leaveDayType);

    const hasUpdates =
      dto.leaveType !== undefined ||
      dto.fromDate !== undefined ||
      dto.toDate !== undefined ||
      dto.remarks !== undefined ||
      leaveDayTypeUpdate !== undefined;

    if (!hasUpdates) {
      throw new BadRequestException('No fields provided to update');
    }

    const leaveType =
      dto.leaveType !== undefined
        ? requireNonEmptyString(dto.leaveType, 'leaveType', 100)
        : existing.LeaveType;
    const fromDate =
      dto.fromDate !== undefined
        ? requireDateString(dto.fromDate, 'fromDate')
        : this.toDateOnly(existing.FromDate);
    const toDate =
      dto.toDate !== undefined
        ? requireDateString(dto.toDate, 'toDate')
        : this.toDateOnly(existing.ToDate);
    const remarks =
      dto.remarks !== undefined
        ? optionalString(dto.remarks, 'remarks', 1000)
        : existing.Remarks;
    const leaveDayType = leaveDayTypeUpdate ?? existing.LeaveDayType;

    if (toDate < fromDate) {
      throw new BadRequestException('toDate cannot be earlier than fromDate');
    }

    const updated = await this.databaseService.queryOne<LeaveRecord>(
      `
        UPDATE LeaveRequest
        SET
          LeaveType = @leaveType,
          FromDate = @fromDate,
          ToDate = @toDate,
          Remarks = @remarks,
          LeaveDayType = @leaveDayType
        OUTPUT
          ${LEAVE_OUTPUT}
        WHERE LeaveID = @leaveId;
      `,
      { leaveId, leaveType, fromDate, toDate, remarks, leaveDayType },
    );

    if (!updated) {
      throw new NotFoundException('Leave request not found');
    }

    return updated;
  }

  async approve(id: number, dto: ApproveLeaveDto): Promise<LeaveRecord> {
    const leaveId = parsePositiveInt(id, 'id');
    const existing = await this.findById(leaveId);
    const role = requireNonEmptyString(dto.role, 'role', 50).toUpperCase();
    const approvedBy = parsePositiveInt(dto.approvedBy, 'approvedBy');
    const remarks =
      dto.remarks !== undefined
        ? optionalString(dto.remarks, 'remarks', 1000)
        : existing.Remarks;

    await this.ensureEmployeeExists(approvedBy, 'approvedBy');

    if (FINAL_STATUSES.has(existing.Status)) {
      throw new BadRequestException(
        `Cannot approve a leave request with status ${existing.Status}`,
      );
    }

    if (role === 'HOD') {
      if (existing.Status !== 'Pending') {
        throw new BadRequestException(
          'HOD approval is only allowed for Pending leave requests',
        );
      }

      const updated = await this.applyApprovalUpdate(leaveId, {
        status: 'HOD Approved',
        hodApprovedBy: approvedBy,
        hrApprovedBy: existing.HRApprovedBy,
        remarks,
      });
      await this.notifyLeaveDecision(updated, 'HOD Approved');
      return updated;
    }

    if (role === 'HR') {
      if (existing.Status !== 'Pending' && existing.Status !== 'HOD Approved') {
        throw new BadRequestException(
          'HR approval is only allowed for Pending or HOD Approved leave requests',
        );
      }

      const updated = await this.applyApprovalUpdate(leaveId, {
        status: 'HR Approved',
        hodApprovedBy: existing.HODApprovedBy,
        hrApprovedBy: approvedBy,
        remarks,
      });
      await this.notifyLeaveDecision(updated, 'HR Approved');
      return updated;
    }

    throw new BadRequestException('role must be HOD or HR');
  }

  async reject(id: number, dto: RejectLeaveDto): Promise<LeaveRecord> {
    const leaveId = parsePositiveInt(id, 'id');
    const existing = await this.findById(leaveId);
    const rejectedBy = optionalPositiveInt(dto.rejectedBy, 'rejectedBy');
    const remarks =
      dto.remarks !== undefined
        ? optionalString(dto.remarks, 'remarks', 1000)
        : existing.Remarks;

    if (FINAL_STATUSES.has(existing.Status)) {
      throw new BadRequestException(
        `Cannot reject a leave request with status ${existing.Status}`,
      );
    }

    if (rejectedBy !== null) {
      await this.ensureEmployeeExists(rejectedBy, 'rejectedBy');
    }

    const updated = await this.databaseService.queryOne<LeaveRecord>(
      `
        UPDATE LeaveRequest
        SET
          Status = @status,
          Remarks = @remarks
        OUTPUT
          ${LEAVE_OUTPUT}
        WHERE LeaveID = @leaveId;
      `,
      {
        leaveId,
        status: 'Rejected',
        remarks,
      },
    );

    if (!updated) {
      throw new NotFoundException('Leave request not found');
    }

    await this.notifyLeaveDecision(updated, 'Rejected');
    return updated;
  }

  /**
   * Cancellation is allowed for Pending and HOD Approved only.
   * HR Approved / Rejected / Cancelled are final.
   * Employee may cancel only their own leave.
   */
  async cancel(id: number, user: AuthUser): Promise<LeaveRecord> {
    const leaveId = parsePositiveInt(id, 'id');
    const existing = await this.findById(leaveId);

    if (existing.Status !== 'Pending' && existing.Status !== 'HOD Approved') {
      throw new BadRequestException(
        `Cannot cancel a leave request with status ${existing.Status}`,
      );
    }

    if (user.role === 'EMPLOYEE' && Number(existing.EmpID) !== Number(user.empId)) {
      throw new ForbiddenException('You can only cancel your own leave request');
    }

    if (user.role === 'HOD') {
      const leaveEmp = await this.employeeService.findById(existing.EmpID);
      const actor = await this.employeeService.findById(user.empId);
      if (leaveEmp.DepartmentID !== actor.DepartmentID) {
        throw new ForbiddenException(
          'HOD can only cancel leave for employees in their department',
        );
      }
    }

    const updated = await this.databaseService.queryOne<LeaveRecord>(
      `
        UPDATE LeaveRequest
        SET Status = @status
        OUTPUT
          ${LEAVE_OUTPUT}
        WHERE LeaveID = @leaveId;
      `,
      { leaveId, status: 'Cancelled' },
    );

    if (!updated) {
      throw new NotFoundException('Leave request not found');
    }

    await this.notifyLeaveDecision(updated, 'Cancelled');
    return updated;
  }

  private async applyApprovalUpdate(
    leaveId: number,
    values: {
      status: string;
      hodApprovedBy: number | null;
      hrApprovedBy: number | null;
      remarks: string | null;
    },
  ): Promise<LeaveRecord> {
    const updated = await this.databaseService.queryOne<LeaveRecord>(
      `
        UPDATE LeaveRequest
        SET
          Status = @status,
          HODApprovedBy = @hodApprovedBy,
          HRApprovedBy = @hrApprovedBy,
          Remarks = @remarks
        OUTPUT
          ${LEAVE_OUTPUT}
        WHERE LeaveID = @leaveId;
      `,
      {
        leaveId,
        status: values.status,
        hodApprovedBy: values.hodApprovedBy,
        hrApprovedBy: values.hrApprovedBy,
        remarks: values.remarks,
      },
    );

    if (!updated) {
      throw new NotFoundException('Leave request not found');
    }

    return updated;
  }

  private formatLeaveDate(value: Date | string): string {
    const iso = this.toDateOnly(value);
    const date = new Date(`${iso}T00:00:00`);
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}-${months[date.getMonth()]}-${date.getFullYear()}`;
  }

  private async notifyLeaveSubmitted(leave: LeaveRecord): Promise<void> {
    try {
      const employee = await this.employeeService.findById(leave.EmpID);
      const name = [employee.FirstName, employee.MiddleName, employee.LastName]
        .filter(Boolean)
        .join(' ');
      const fromDate = this.formatLeaveDate(leave.FromDate);
      const toDate = this.formatLeaveDate(leave.ToDate);
      const hods = await this.notificationService.findHodUsersForDepartment(
        employee.DepartmentID,
      );
      const hrs = await this.notificationService.findUsersByRole('HR');
      await this.notificationService.notify({
        targets: [...hods, ...hrs],
        type: 'LEAVE_SUBMITTED',
        title: 'New Leave Request',
        message: `${name} has submitted a leave request from ${fromDate} to ${toDate}.`,
        relatedEntity: 'LeaveRequest',
        relatedEntityId: Number(leave.LeaveID),
      });
    } catch (error) {
      this.logger.warn(
        `Leave submitted notification failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private async notifyLeaveDecision(
    leave: LeaveRecord,
    decision: string,
  ): Promise<void> {
    try {
      const fromDate = this.formatLeaveDate(leave.FromDate);
      const toDate = this.formatLeaveDate(leave.ToDate);
      const targets = await this.notificationService.findUsersByEmpId(
        leave.EmpID,
      );
      const isRejected = decision === 'Rejected';
      const isCancelled = decision === 'Cancelled';
      await this.notificationService.notify({
        targets,
        type: isRejected
          ? 'LEAVE_REJECTED'
          : isCancelled
            ? 'LEAVE_CANCELLED'
            : 'LEAVE_APPROVED',
        title: isRejected
          ? 'Leave Rejected'
          : isCancelled
            ? 'Leave Cancelled'
            : 'Leave Approved',
        message: `Your leave request from ${fromDate} to ${toDate} has been ${
          isRejected ? 'rejected' : isCancelled ? 'cancelled' : 'approved'
        }.`,
        relatedEntity: 'LeaveRequest',
        relatedEntityId: Number(leave.LeaveID),
      });
    } catch (error) {
      this.logger.warn(
        `Leave decision notification failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    }
  }

  private async ensureEmployeeExists(
    empId: number,
    fieldName: string,
  ): Promise<void> {
    const exists = await this.employeeService.exists(empId);
    if (!exists) {
      throw new BadRequestException(
        `${fieldName} does not reference a valid employee`,
      );
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
}
