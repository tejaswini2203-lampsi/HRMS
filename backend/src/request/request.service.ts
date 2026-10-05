import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { SlaService } from '../sla/sla.service';
import { AuthUser } from '../auth/auth.types';

export interface EmployeeRequestRecord {
  RequestID: number;
  RequestCode: string;
  RequestType: string;
  EmpID: number;
  RegionCode: string;
  Amount: number | null;
  Reason: string;
  RepaymentSchedule: string | null;
  Status: string;
  CurrentApproverRole: string;
  HODApprovedBy: number | null;
  HODApprovedAt: Date | null;
  HODRemarks: string | null;
  HRApprovedBy: number | null;
  HRApprovedAt: Date | null;
  HRRemarks: string | null;
  FinanceApprovedBy: number | null;
  FinanceApprovedAt: Date | null;
  FinanceRemarks: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
  // Joined employee
  FirstName?: string;
  LastName?: string;
  Designation?: string;
  Salary?: number;
}

@Injectable()
export class RequestService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly slaService: SlaService,
  ) {}

  async findAll(
    user: AuthUser,
    filters: {
      requestType?: string;
      status?: string;
      regionCode?: string;
      empId?: number;
    } = {},
  ): Promise<EmployeeRequestRecord[]> {
    let query = `
      SELECT
        r.*,
        e.FirstName,
        e.LastName,
        e.Designation,
        e.Salary
      FROM dbo.EmployeeRequest r
      INNER JOIN dbo.Employee e ON r.EmpID = e.EmpID
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};

    if (filters.requestType) {
      query += ` AND r.RequestType = @requestType`;
      params.requestType = filters.requestType;
    }
    if (filters.status && filters.status !== 'all') {
      query += ` AND r.Status = @status`;
      params.status = filters.status;
    }
    if (filters.regionCode && filters.regionCode !== 'all') {
      query += ` AND r.RegionCode = @regionCode`;
      params.regionCode = filters.regionCode;
    }
    if (filters.empId) {
      query += ` AND r.EmpID = @empId`;
      params.empId = filters.empId;
    }

    // Role filtering
    if (user.role === 'EMPLOYEE') {
      query += ` AND r.EmpID = @userEmpId`;
      params.userEmpId = user.empId;
    } else if (user.role === 'HOD') {
      query += ` AND (e.ReportsToEmpID = @userEmpId OR r.EmpID = @userEmpId)`;
      params.userEmpId = user.empId;
    }
    // HR & ADMIN have full cross-region access

    query += ` ORDER BY r.RequestID DESC;`;

    return this.databaseService.query<EmployeeRequestRecord>(query, params);
  }

  async findById(id: number, user: AuthUser): Promise<EmployeeRequestRecord> {
    const req = await this.databaseService.queryOne<EmployeeRequestRecord>(
      `
        SELECT
          r.*,
          e.FirstName,
          e.LastName,
          e.Designation,
          e.Salary
        FROM dbo.EmployeeRequest r
        INNER JOIN dbo.Employee e ON r.EmpID = e.EmpID
        WHERE r.RequestID = @id;
      `,
      { id },
    );
    if (!req) throw new NotFoundException('Request not found');

    if (user.role === 'EMPLOYEE' && req.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied');
    }
    return req;
  }

  async createRequest(
    data: {
      requestType: string; // 'SALARY_ADVANCE' | 'GRATUITY_ADVANCE'
      amount: number;
      reason: string;
      repaymentScheduleMonths?: number;
      installmentAmount?: number;
    },
    user: AuthUser,
  ): Promise<EmployeeRequestRecord> {
    if (!data.amount || data.amount <= 0) {
      throw new BadRequestException('Amount must be greater than zero');
    }
    if (!data.reason || !data.reason.trim()) {
      throw new BadRequestException('Reason is required');
    }

    const emp = await this.databaseService.queryOne<any>(
      `SELECT EmpID, FirstName, LastName, SubsidiaryID, ReportsToEmpID FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId: user.empId },
    );
    if (!emp) throw new NotFoundException('Employee record not found');

    const regionCode = emp.SubsidiaryID || 'uae';
    const countRes = await this.databaseService.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM dbo.EmployeeRequest;`,
    );
    const requestCode = `REQ-${(countRes?.count ?? 0) + 101}`;

    const repaymentSchedule = JSON.stringify({
      months: data.repaymentScheduleMonths || 3,
      installmentAmount: data.installmentAmount || Math.round((data.amount / (data.repaymentScheduleMonths || 3)) * 100) / 100,
      note: 'Stored repayment schedule for future Payroll (Phase 1)',
    });

    const created = await this.databaseService.queryOne<EmployeeRequestRecord>(
      `
        INSERT INTO dbo.EmployeeRequest (
          RequestCode,
          RequestType,
          EmpID,
          RegionCode,
          Amount,
          Reason,
          RepaymentSchedule,
          Status,
          CurrentApproverRole
        )
        OUTPUT INSERTED.*
        VALUES (
          @requestCode,
          @requestType,
          @empId,
          @regionCode,
          @amount,
          @reason,
          @repaymentSchedule,
          'PENDING_HOD',
          'HOD'
        );
      `,
      {
        requestCode,
        requestType: data.requestType,
        empId: user.empId,
        regionCode,
        amount: data.amount,
        reason: data.reason.trim(),
        repaymentSchedule,
      },
    );

    if (!created) throw new BadRequestException('Failed to create request');

    // Create Work Queue Task for HOD
    const dueDate = this.slaService.calculateDueDate(new Date(), 2, 'BUSINESS').toISOString().slice(0, 10);
    await this.databaseService.query(
      `
        INSERT INTO dbo.WorkQueueTask (
          SourceModule,
          SourceID,
          ActionKey,
          TargetEmpID,
          RegionCode,
          AssignedRole,
          AssignedEmpID,
          Title,
          Instruction,
          PrimaryActionLabel,
          Priority,
          DueDate,
          SLAStatus,
          Status
        ) VALUES (
          'Request',
          @sourceId,
          'HOD_APPROVAL',
          @targetEmpId,
          @regionCode,
          'HOD',
          @assignedEmpId,
          @title,
          @instruction,
          'Review Request',
          'MEDIUM',
          @dueDate,
          'ON_TIME',
          'OPEN'
        );
      `,
      {
        sourceId: String(created.RequestID),
        targetEmpId: user.empId,
        regionCode,
        assignedEmpId: emp.ReportsToEmpID || null,
        title: `${user.name} — ${data.requestType === 'SALARY_ADVANCE' ? 'Salary Advance' : 'Gratuity Advance'} (AED/SAR ${data.amount})`,
        instruction: `Review and confirm ${data.requestType.replace('_', ' ')} request of ${data.amount} for ${user.name}.`,
        dueDate,
      },
    );

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'SUBMIT_ADVANCE_REQUEST',
      module: 'Requests',
      recordId: String(created.RequestID),
      afterValue: JSON.stringify({ amount: data.amount, type: data.requestType }),
      empId: user.empId,
      regionCode,
      source: 'Request Engine',
    });

    return created;
  }

  async processApproval(
    requestId: number,
    data: {
      action: 'APPROVE' | 'REJECT';
      remarks?: string;
    },
    user: AuthUser,
  ): Promise<any> {
    const req = await this.databaseService.queryOne<any>(
      `SELECT r.*, e.FirstName, e.LastName FROM dbo.EmployeeRequest r INNER JOIN dbo.Employee e ON r.EmpID = e.EmpID WHERE r.RequestID = @requestId;`,
      { requestId },
    );
    if (!req) throw new NotFoundException('Request not found');

    const remarks = data.remarks || null;

    if (data.action === 'REJECT') {
      await this.databaseService.query(
        `
          UPDATE dbo.EmployeeRequest
          SET Status = 'REJECTED', UpdatedAt = SYSDATETIME()
          WHERE RequestID = @requestId;
        `,
        { requestId },
      );

      // Close Work Queue Task
      await this.databaseService.query(
        `
          UPDATE dbo.WorkQueueTask
          SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
          WHERE SourceModule = 'Request' AND SourceID = @sourceId AND Status IN ('OPEN', 'IN_PROGRESS');
        `,
        { sourceId: String(requestId), empId: user.empId },
      );

      await this.auditService.log({
        actorEmpId: user.empId,
        actorName: user.name,
        actorRole: user.role,
        action: 'REJECT_ADVANCE_REQUEST',
        module: 'Requests',
        recordId: String(requestId),
        afterValue: 'REJECTED: ' + (remarks || ''),
        empId: req.EmpID,
        regionCode: req.RegionCode,
        source: 'Work Queue',
      });

      return { success: true, status: 'REJECTED' };
    }

    // Determine next step in approval chain: PENDING_HOD -> PENDING_HR -> PENDING_FINANCE -> APPROVED
    let nextStatus = 'APPROVED';
    let nextRole = 'COMPLETED';

    if (req.Status === 'PENDING_HOD') {
      nextStatus = 'PENDING_HR';
      nextRole = 'HR';
      await this.databaseService.query(
        `
          UPDATE dbo.EmployeeRequest
          SET Status = @nextStatus, CurrentApproverRole = @nextRole, HODApprovedBy = @userId, HODApprovedAt = SYSDATETIME(), HODRemarks = @remarks, UpdatedAt = SYSDATETIME()
          WHERE RequestID = @requestId;
        `,
        { requestId, nextStatus, nextRole, userId: user.empId, remarks },
      );
    } else if (req.Status === 'PENDING_HR') {
      nextStatus = 'PENDING_FINANCE';
      nextRole = 'HR'; // Or Finance
      await this.databaseService.query(
        `
          UPDATE dbo.EmployeeRequest
          SET Status = @nextStatus, CurrentApproverRole = @nextRole, HRApprovedBy = @userId, HRApprovedAt = SYSDATETIME(), HRRemarks = @remarks, UpdatedAt = SYSDATETIME()
          WHERE RequestID = @requestId;
        `,
        { requestId, nextStatus, nextRole, userId: user.empId, remarks },
      );
    } else if (req.Status === 'PENDING_FINANCE') {
      nextStatus = 'APPROVED';
      nextRole = 'COMPLETED';
      await this.databaseService.query(
        `
          UPDATE dbo.EmployeeRequest
          SET Status = @nextStatus, CurrentApproverRole = @nextRole, FinanceApprovedBy = @userId, FinanceApprovedAt = SYSDATETIME(), FinanceRemarks = @remarks, UpdatedAt = SYSDATETIME()
          WHERE RequestID = @requestId;
        `,
        { requestId, nextStatus, nextRole, userId: user.empId, remarks },
      );
    }

    // Close previous task
    await this.databaseService.query(
      `
        UPDATE dbo.WorkQueueTask
        SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
        WHERE SourceModule = 'Request' AND SourceID = @sourceId AND Status IN ('OPEN', 'IN_PROGRESS');
      `,
      { sourceId: String(requestId), empId: user.empId },
    );

    // If next status is not APPROVED, generate next Work Queue Task
    if (nextStatus !== 'APPROVED') {
      const dueDate = this.slaService.calculateDueDate(new Date(), 2, 'BUSINESS').toISOString().slice(0, 10);
      await this.databaseService.query(
        `
          INSERT INTO dbo.WorkQueueTask (
            SourceModule,
            SourceID,
            ActionKey,
            TargetEmpID,
            RegionCode,
            AssignedRole,
            Title,
            Instruction,
            PrimaryActionLabel,
            Priority,
            DueDate,
            SLAStatus,
            Status
          ) VALUES (
            'Request',
            @sourceId,
            @actionKey,
            @targetEmpId,
            @regionCode,
            @assignedRole,
            @title,
            @instruction,
            'Approve Request',
            'HIGH',
            @dueDate,
            'ON_TIME',
            'OPEN'
          );
        `,
        {
          sourceId: String(requestId),
          actionKey: `${nextRole}_APPROVAL`,
          targetEmpId: req.EmpID,
          regionCode: req.RegionCode,
          assignedRole: nextRole,
          title: `${req.FirstName} ${req.LastName} — ${req.RequestType.replace('_', ' ')} (${nextStatus})`,
          instruction: `Action required: ${nextRole} approval for advance amount of ${req.Amount}.`,
          dueDate,
        },
      );
    }

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: `APPROVE_ADVANCE_STEP_${req.Status}`,
      module: 'Requests',
      recordId: String(requestId),
      beforeValue: req.Status,
      afterValue: nextStatus,
      empId: req.EmpID,
      regionCode: req.RegionCode,
      source: 'Work Queue',
    });

    return { success: true, status: nextStatus };
  }
}
