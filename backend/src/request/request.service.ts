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
  ReportsToEmpID?: number | null;
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
        e.Salary,
        e.ReportsToEmpID
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
    } else if (user.role === 'HR' && user.subsidiaryId) {
      query += ` AND (r.RegionCode = @userSub OR r.RegionCode = @userSubAlt)`;
      params.userSub = user.subsidiaryId;
      params.userSubAlt =
        user.subsidiaryId === 'saudi' ? 'KSA' : user.subsidiaryId === 'uae' ? 'UAE' : user.subsidiaryId;
    }

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
          e.Salary,
          e.ReportsToEmpID
        FROM dbo.EmployeeRequest r
        INNER JOIN dbo.Employee e ON r.EmpID = e.EmpID
        WHERE r.RequestID = @id;
      `,
      { id },
    );
    if (!req) throw new NotFoundException('Request not found');

    if (user.role === 'EMPLOYEE' && req.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied: You can only view your own requests');
    }
    if (user.role === 'HOD' && req.ReportsToEmpID !== user.empId && req.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied: Request is outside your authorized reporting hierarchy');
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
      preferredStartDate?: string;
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
      `SELECT EmpID, FirstName, LastName, SubsidiaryID, ReportsToEmpID, Salary, JoiningDate FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId: user.empId },
    );
    if (!emp) throw new NotFoundException('Employee record not found');

    const regionCode = emp.SubsidiaryID || 'uae';

    // 1. Evaluate Configurable Eligibility Rules
    const rule = await this.databaseService.queryOne<any>(
      `
        SELECT TOP 1 * FROM dbo.AdvanceEligibilityRule
        WHERE RequestTypeCode = @type AND (RegionCode = @reg OR RegionCode = 'ALL') AND IsActive = 1
        ORDER BY RuleID DESC;
      `,
      { type: data.requestType, reg: regionCode },
    );

    let eligibilityNote = 'Eligibility parameters verified against policy rules';
    if (!rule || rule.PendingConfirmation) {
      // Pending confirmation: do NOT hardcode fake thresholds, allow submission with advisory notice
      eligibilityNote = `Eligibility parameters pending regional HR confirmation for ${regionCode} — proceeding with review chain`;
    } else {
      // Confirmed rule evaluation
      if (rule.MaxSalaryPercentage && emp.Salary) {
        const maxEligible = (Number(emp.Salary) * Number(rule.MaxSalaryPercentage)) / 100;
        if (data.amount > maxEligible) {
          throw new BadRequestException(
            `Requested amount exceeds maximum policy threshold of ${rule.MaxSalaryPercentage}% of salary (${maxEligible})`,
          );
        }
      }
      if (rule.MinTenureMonths && emp.JoiningDate) {
        const monthsTenure = Math.floor(
          (Date.now() - new Date(emp.JoiningDate).getTime()) / (1000 * 60 * 60 * 24 * 30.4375),
        );
        if (monthsTenure < rule.MinTenureMonths) {
          throw new BadRequestException(
            `Minimum service tenure of ${rule.MinTenureMonths} months required (current: ${monthsTenure} months)`,
          );
        }
      }
    }

    // 2. Determine initial step from ApprovalChainMaster
    const chainSteps = await this.databaseService.query<any>(
      `
        SELECT * FROM dbo.ApprovalChainMaster
        WHERE RequestTypeCode = @type AND (RegionCode = @reg OR RegionCode = 'ALL')
        ORDER BY SequenceOrder ASC;
      `,
      { type: data.requestType, reg: regionCode },
    );

    const initialRole = chainSteps.length > 0 ? chainSteps[0].ApproverRole : 'HOD';
    const initialStatus = `PENDING_${initialRole}`;

    const countRes = await this.databaseService.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM dbo.EmployeeRequest;`,
    );
    const requestCode = `REQ-${(countRes?.count ?? 0) + 101}`;

    const months = data.repaymentScheduleMonths || 3;
    const instAmount =
      data.installmentAmount || Math.round((data.amount / months) * 100) / 100;

    const repaymentSchedule = JSON.stringify({
      months,
      installmentAmount: instAmount,
      startDate: (data as any).startDate || data.preferredStartDate || null,
      note: 'Stored repayment schedule for future Payroll (Phase 1)',
      eligibilityStatus: eligibilityNote,
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
          @status,
          @currentApproverRole
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
        status: initialStatus,
        currentApproverRole: initialRole,
      },
    );

    if (!created) throw new BadRequestException('Failed to create request');

    // 3. Create initial Work Queue Task for first approver role
    const slaDays = chainSteps.length > 0 ? chainSteps[0].SLADays || 2 : 2;
    const dueDate = this.slaService.calculateDueDate(new Date(), slaDays, 'BUSINESS').toISOString().slice(0, 10);
    const assignedEmpId = initialRole === 'HOD' ? emp.ReportsToEmpID || null : null;

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
          @actionKey,
          @targetEmpId,
          @regionCode,
          @assignedRole,
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
        actionKey: `${initialRole}_APPROVAL`,
        targetEmpId: user.empId,
        regionCode,
        assignedRole: initialRole,
        assignedEmpId,
        title: `${user.name} — ${data.requestType === 'SALARY_ADVANCE' ? 'Salary Advance' : 'Gratuity Advance'} (${regionCode === 'saudi' ? 'SAR' : 'AED'} ${data.amount})`,
        instruction: `Review and confirm ${data.requestType.replace('_', ' ')} request of ${data.amount} for ${user.name}. ${eligibilityNote}.`,
        dueDate,
      },
    );

    // 4. Audit Log
    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'SUBMIT_ADVANCE_REQUEST',
      module: 'Requests',
      recordId: String(created.RequestID),
      afterValue: JSON.stringify({
        amount: data.amount,
        type: data.requestType,
        eligibilityStatus: eligibilityNote,
        repaymentSchedule: { months, installmentAmount: instAmount },
      }),
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
      startDate?: string;
    },
    user: AuthUser,
  ): Promise<any> {
    const req = await this.databaseService.queryOne<any>(
      `
        SELECT r.*, e.FirstName, e.LastName, e.ReportsToEmpID
        FROM dbo.EmployeeRequest r
        INNER JOIN dbo.Employee e ON r.EmpID = e.EmpID
        WHERE r.RequestID = @requestId;
      `,
      { requestId },
    );
    if (!req) throw new NotFoundException('Request not found');

    // Regional isolation check for HR and HOD
    if ((user.role === 'HR' || user.role === 'HOD') && user.subsidiaryId) {
      const userSub = user.subsidiaryId.toLowerCase();
      const reqSub = (req.RegionCode || '').toLowerCase();
      const normalizedUserSub = userSub === 'saudi' ? 'ksa' : userSub;
      const normalizedReqSub = reqSub === 'saudi' ? 'ksa' : reqSub;
      if (normalizedUserSub !== normalizedReqSub) {
        throw new ForbiddenException(
          'Access denied: You cannot process requests outside your assigned regional entity',
        );
      }
    }

    // Role-based security check for current approver
    if (req.CurrentApproverRole === 'HOD') {
      if (user.role !== 'HOD' && user.role !== 'ADMIN') {
        throw new ForbiddenException('Only the reporting HOD or Admin can approve this initial department step');
      }
      if (user.role === 'HOD' && req.ReportsToEmpID !== user.empId && req.EmpID !== user.empId) {
        throw new ForbiddenException('Access denied: Request is outside your authorized reporting hierarchy');
      }
    } else if (req.CurrentApproverRole === 'HR') {
      if (user.role !== 'HR' && user.role !== 'ADMIN') {
        throw new ForbiddenException('Only HR or Admin can process HR approval');
      }
    } else if (req.CurrentApproverRole === 'FINANCE') {
      if (user.role !== 'ADMIN' && user.role !== 'FINANCE') {
        throw new ForbiddenException('Only Finance or Admin can process Finance approval');
      }
    }

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
        action: `REJECT_ADVANCE_${req.CurrentApproverRole}`,
        module: 'Requests',
        recordId: String(requestId),
        afterValue: 'REJECTED: ' + (remarks || ''),
        empId: req.EmpID,
        regionCode: req.RegionCode,
        source: 'Work Queue',
      });

      return { success: true, status: 'REJECTED' };
    }

    // Dynamic next step lookup from dbo.ApprovalChainMaster
    const chainSteps = await this.databaseService.query<any>(
      `
        SELECT * FROM dbo.ApprovalChainMaster
        WHERE RequestTypeCode = @type AND (RegionCode = @reg OR RegionCode = 'ALL')
        ORDER BY SequenceOrder ASC;
      `,
      { type: req.RequestType, reg: req.RegionCode },
    );

    const currentIdx = chainSteps.findIndex((c: any) => c.ApproverRole === req.CurrentApproverRole);
    const nextStep = currentIdx >= 0 && currentIdx + 1 < chainSteps.length ? chainSteps[currentIdx + 1] : null;

    let nextStatus = 'APPROVED';
    let nextRole = 'COMPLETED';

    if (nextStep) {
      nextStatus = `PENDING_${nextStep.ApproverRole}`;
      nextRole = nextStep.ApproverRole;
    }

    // Parse and update repayment schedule with start date
    let schedObj: any = {};
    try {
      schedObj = JSON.parse(req.RepaymentSchedule || '{}');
    } catch {}

    const resolvedStartDate =
      data.startDate ||
      schedObj.startDate ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const updatedRepaymentSchedule = JSON.stringify({
      months: schedObj.months || 3,
      installmentAmount:
        schedObj.installmentAmount || Math.round((Number(req.Amount) / (schedObj.months || 3)) * 100) / 100,
      startDate: resolvedStartDate,
      approvedAmount: Number(req.Amount),
      status: nextStatus === 'APPROVED' ? 'APPROVED_STORED_FOR_PAYROLL' : 'IN_REVIEW',
      note: 'Stored approved advance and repayment schedule for future Payroll (Phase 1) — Payroll deductions out of scope',
    });

    // Update approval timestamps per role
    if (req.CurrentApproverRole === 'HOD') {
      await this.databaseService.query(
        `
          UPDATE dbo.EmployeeRequest
          SET
            Status = @nextStatus,
            CurrentApproverRole = @nextRole,
            HODApprovedBy = @userId,
            HODApprovedAt = SYSDATETIME(),
            HODRemarks = @remarks,
            RepaymentSchedule = @repaymentSchedule,
            UpdatedAt = SYSDATETIME()
          WHERE RequestID = @requestId;
        `,
        { requestId, nextStatus, nextRole, userId: user.empId, remarks, repaymentSchedule: updatedRepaymentSchedule },
      );
    } else if (req.CurrentApproverRole === 'HR') {
      await this.databaseService.query(
        `
          UPDATE dbo.EmployeeRequest
          SET
            Status = @nextStatus,
            CurrentApproverRole = @nextRole,
            HRApprovedBy = @userId,
            HRApprovedAt = SYSDATETIME(),
            HRRemarks = @remarks,
            RepaymentSchedule = @repaymentSchedule,
            UpdatedAt = SYSDATETIME()
          WHERE RequestID = @requestId;
        `,
        { requestId, nextStatus, nextRole, userId: user.empId, remarks, repaymentSchedule: updatedRepaymentSchedule },
      );
    } else if (req.CurrentApproverRole === 'FINANCE') {
      await this.databaseService.query(
        `
          UPDATE dbo.EmployeeRequest
          SET
            Status = @nextStatus,
            CurrentApproverRole = @nextRole,
            FinanceApprovedBy = @userId,
            FinanceApprovedAt = SYSDATETIME(),
            FinanceRemarks = @remarks,
            RepaymentSchedule = @repaymentSchedule,
            UpdatedAt = SYSDATETIME()
          WHERE RequestID = @requestId;
        `,
        { requestId, nextStatus, nextRole, userId: user.empId, remarks, repaymentSchedule: updatedRepaymentSchedule },
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
      const slaDays = nextStep ? nextStep.SLADays || 2 : 2;
      const dueDate = this.slaService.calculateDueDate(new Date(), slaDays, 'BUSINESS').toISOString().slice(0, 10);
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
          instruction: `Action required: ${nextRole} review and approval for advance of ${req.Amount}.`,
          dueDate,
        },
      );
    }

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: `APPROVE_ADVANCE_STEP_${req.CurrentApproverRole}`,
      module: 'Requests',
      recordId: String(requestId),
      beforeValue: req.Status,
      afterValue: nextStatus,
      empId: req.EmpID,
      regionCode: req.RegionCode,
      source: 'Work Queue',
    });

    return {
      success: true,
      status: nextStatus,
      currentApproverRole: nextRole,
      repaymentSchedule: JSON.parse(updatedRepaymentSchedule),
    };
  }
}
