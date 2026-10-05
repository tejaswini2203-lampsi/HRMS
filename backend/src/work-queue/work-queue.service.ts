import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { SlaService } from '../sla/sla.service';
import { ComplianceService } from '../compliance/compliance.service';
import { LetterService } from '../letter/letter.service';
import { RequestService } from '../request/request.service';
import { DocumentService } from '../document/document.service';
import { AuthUser } from '../auth/auth.types';

export interface WorkQueueTaskRecord {
  TaskID: number;
  SourceModule: string;
  SourceID: string;
  ActionKey: string;
  TargetEmpID: number;
  RegionCode: string;
  AssignedRole: string;
  AssignedEmpID: number | null;
  Title: string;
  Instruction: string;
  PrimaryActionLabel: string;
  Priority: string;
  DueDate: string;
  SLAStatus: string;
  Status: string;
  BlockReason: string | null;
  CompletedByEmpID: number | null;
  CompletedAt: Date | null;
  CreatedAt: Date;
  // Joined target employee info
  TargetFirstName?: string;
  TargetLastName?: string;
  TargetDesignation?: string;
  TargetDepartmentName?: string;
  IqamaNumber?: string;
  IqamaExpiry?: string;
  VisaNumber?: string;
  VisaExpiry?: string;
  UAEEmployeeCategory?: string;
  KSAVendorType?: string;
  Sponsor?: string;
  CountryRegion?: string;
  SubsidiaryID?: string;
  JoiningDate?: string;
  Salary?: number;
  EmploymentType?: string;
  ReportsToEmpID?: number | null;
}

@Injectable()
export class WorkQueueService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly slaService: SlaService,
    private readonly complianceService: ComplianceService,
    private readonly letterService: LetterService,
    private readonly requestService: RequestService,
    private readonly documentService: DocumentService,
  ) {}

  async getTasks(
    user: AuthUser,
    filters: {
      status?: string;
      regionCode?: string;
      priority?: string;
    } = {},
  ): Promise<WorkQueueTaskRecord[]> {
    let query = `
      SELECT
        t.TaskID,
        t.SourceModule,
        t.SourceID,
        t.ActionKey,
        t.TargetEmpID,
        t.RegionCode,
        t.AssignedRole,
        t.AssignedEmpID,
        t.Title,
        t.Instruction,
        t.PrimaryActionLabel,
        t.Priority,
        CONVERT(varchar(10), t.DueDate, 23) AS DueDate,
        t.SLAStatus,
        t.Status,
        t.BlockReason,
        t.CompletedByEmpID,
        t.CompletedAt,
        t.CreatedAt,
        e.FirstName AS TargetFirstName,
        e.LastName AS TargetLastName,
        e.Designation AS TargetDesignation,
        d.DepartmentName AS TargetDepartmentName
      FROM dbo.WorkQueueTask t
      INNER JOIN dbo.Employee e ON t.TargetEmpID = e.EmpID
      LEFT JOIN dbo.Department d ON e.DepartmentID = d.DepartmentID
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};

    // Filter by task status ('OPEN' by default for active daily queue)
    if (filters.status && filters.status !== 'all') {
      query += ` AND t.Status = @status`;
      params.status = filters.status;
    } else if (!filters.status) {
      query += ` AND t.Status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED')`;
    }

    if (filters.regionCode && filters.regionCode !== 'all') {
      query += ` AND t.RegionCode = @regionCode`;
      params.regionCode = filters.regionCode;
    }
    if (filters.priority) {
      query += ` AND t.Priority = @priority`;
      params.priority = filters.priority;
    }

    // Role-based visibility
    if (user.role === 'EMPLOYEE') {
      // Employee sees tasks assigned directly to them or where they are target
      query += ` AND (t.AssignedEmpID = @userEmpId OR (t.AssignedRole = 'EMPLOYEE' AND t.TargetEmpID = @userEmpId))`;
      params.userEmpId = user.empId;
    } else if (user.role === 'HOD') {
      // HOD sees tasks for their role targeting their team members, or assigned to them
      query += ` AND (t.AssignedEmpID = @userEmpId OR (t.AssignedRole = 'HOD' AND (e.ReportsToEmpID = @userEmpId OR t.TargetEmpID = @userEmpId)))`;
      params.userEmpId = user.empId;
    } else if (user.role === 'HR') {
      // HR sees all HR-assigned tasks across UAE & KSA
      query += ` AND (t.AssignedRole IN ('HR', 'SYSTEM') OR t.AssignedEmpID = @userEmpId)`;
      params.userEmpId = user.empId;
    }
    // ADMIN has full visibility over everything

    query += ` ORDER BY CASE WHEN t.Priority = 'HIGH' THEN 1 WHEN t.Priority = 'MEDIUM' THEN 2 ELSE 3 END, t.DueDate ASC;`;

    const tasks = await this.databaseService.query<WorkQueueTaskRecord>(query, params);

    // Refresh dynamic SLA status for active tasks
    return tasks.map((task) => {
      if (task.Status !== 'COMPLETED') {
        const dynamicSLA = this.slaService.getSLAStatus(task.DueDate);
        return { ...task, SLAStatus: dynamicSLA };
      }
      return task;
    });
  }

  async getTaskById(taskId: number, user: AuthUser): Promise<any> {
    const task = await this.databaseService.queryOne<WorkQueueTaskRecord>(
      `
        SELECT
          t.TaskID,
          t.SourceModule,
          t.SourceID,
          t.ActionKey,
          t.TargetEmpID,
          t.RegionCode,
          t.AssignedRole,
          t.AssignedEmpID,
          t.Title,
          t.Instruction,
          t.PrimaryActionLabel,
          t.Priority,
          CONVERT(varchar(10), t.DueDate, 23) AS DueDate,
          t.SLAStatus,
          t.Status,
          t.BlockReason,
          t.CompletedByEmpID,
          t.CompletedAt,
          t.CreatedAt,
          e.FirstName AS TargetFirstName,
          e.LastName AS TargetLastName,
          e.Designation AS TargetDesignation,
          d.DepartmentName AS TargetDepartmentName,
          e.IqamaNumber,
          CONVERT(varchar(10), e.IqamaExpiry, 23) AS IqamaExpiry,
          e.VisaNumber,
          CONVERT(varchar(10), e.VisaExpiry, 23) AS VisaExpiry,
          e.UAEEmployeeCategory,
          e.KSAVendorType,
          e.Sponsor,
          e.CountryRegion,
          e.SubsidiaryID,
          CONVERT(varchar(10), e.JoiningDate, 23) AS JoiningDate,
          e.Salary,
          e.EmploymentType,
          e.ReportsToEmpID
        FROM dbo.WorkQueueTask t
        INNER JOIN dbo.Employee e ON t.TargetEmpID = e.EmpID
        LEFT JOIN dbo.Department d ON e.DepartmentID = d.DepartmentID
        WHERE t.TaskID = @taskId;
      `,
      { taskId },
    );
    if (!task) throw new NotFoundException('Task not found');

    const context: any = {
      sourceType: task.SourceModule,
      documents: [],
      checklist: [],
      history: [],
    };

    try {
      // Fetch documents associated with employee
      const docs = await this.documentService.findAll({
        empId: task.TargetEmpID,
        user,
      });
      context.documents = docs || [];

      if (task.SourceModule === 'Compliance') {
        const caseId = Number(task.SourceID);
        const comp = await this.complianceService.findById(caseId, user);
        context.complianceCase = comp.case;
        context.history = comp.history || [];
        context.checklist = comp.checklist || [];
        context.stages = comp.stages || [];
      } else if (task.SourceModule === 'Letter') {
        const letterId = Number(task.SourceID);
        const lr = await this.letterService.findById(letterId, user);
        let renderedContent = lr.TemplateContent || '';
        const mergeMap: Record<string, string> = {
          '{{EmployeeName}}': `${lr.FirstName} ${lr.LastName}`,
          '{{EmployeeID}}': String(lr.EmpID),
          '{{Designation}}': lr.Designation || 'Officer',
          '{{JoiningDate}}': lr.JoiningDate ? String(lr.JoiningDate) : 'N/A',
          '{{Salary}}': lr.Salary
            ? `${lr.RegionCode === 'saudi' ? 'SAR' : 'AED'} ${Number(lr.Salary).toLocaleString()}`
            : 'Confidential',
          '{{Entity}}':
            lr.RegionCode === 'saudi'
              ? 'EICS Saudi Arabia Commercial Services LLC'
              : 'EICS UAE LLC',
          '{{Region}}':
            lr.RegionCode === 'saudi'
              ? 'Kingdom of Saudi Arabia'
              : 'United Arab Emirates',
        };
        for (const [placeholder, val] of Object.entries(mergeMap)) {
          renderedContent = renderedContent.replaceAll(placeholder, val);
        }
        lr.renderedContent = renderedContent;
        context.letterRequest = lr;
      } else if (task.SourceModule === 'Request') {
        const reqId = Number(task.SourceID);
        const req = await this.requestService.findById(reqId, user);
        context.employeeRequest = req;
      }
    } catch (err) {
      context.fetchError = (err as Error).message;
    }

    return {
      ...task,
      context,
    };
  }

  async executeTaskAction(
    taskId: number,
    data: {
      action: string; // 'CONFIRM', 'REJECT', 'EXECUTE', 'COMPLETE', 'APPROVE'
      comments?: string;
      meta?: any;
    },
    user: AuthUser,
  ): Promise<any> {
    const task = await this.getTaskById(taskId, user);

    if (task.Status === 'COMPLETED') {
      throw new BadRequestException('This task has already been completed');
    }

    // Role check
    if (user.role === 'EMPLOYEE') {
      if (task.AssignedRole !== 'EMPLOYEE') {
        throw new ForbiddenException(`Not authorized to execute this task: requires ${task.AssignedRole} role`);
      }
      if (task.AssignedEmpID && task.AssignedEmpID !== user.empId) {
        throw new ForbiddenException('Not authorized to execute this task');
      }
      if (task.TargetEmpID && task.TargetEmpID !== user.empId && !task.AssignedEmpID) {
        throw new ForbiddenException('Not authorized to execute tasks for another employee');
      }
    } else if (user.role === 'HOD') {
      if (task.AssignedRole !== 'HOD') {
        throw new ForbiddenException(`Not authorized to execute this task: requires ${task.AssignedRole} role`);
      }
      if (task.AssignedEmpID && task.AssignedEmpID !== user.empId) {
        throw new ForbiddenException('Not authorized to execute this task');
      }
    } else if (user.role === 'HR') {
      if (task.AssignedRole === 'ADMIN') {
        throw new ForbiddenException('Not authorized to execute this task: requires ADMIN role');
      }
    }

    const action = (data.action || 'CONFIRM').toUpperCase();

    // Validation: Rejection requires comments
    if (action === 'REJECT' && (!data.comments || !data.comments.trim())) {
      throw new BadRequestException('A reason is required when rejecting a task');
    }

    // Validation: Iqama duration selection requires valid duration
    if (task.ActionKey === 'HOD_DURATION' && action !== 'REJECT') {
      const dur = Number(data.meta?.durationMonths);
      if (!dur || ![3, 6, 12].includes(dur)) {
        throw new BadRequestException('Please select a valid Iqama duration (3, 6, or 12 months)');
      }
    }

    if (task.SourceModule === 'Compliance') {
      const caseId = Number(task.SourceID);
      // Advance or reject the compliance case
      const result = await this.complianceService.advanceStage(
        caseId,
        action,
        data.comments,
        data.meta,
        user,
      );

      // Audit
      await this.auditService.log({
        actorEmpId: user.empId,
        actorName: user.name,
        actorRole: user.role,
        action: `WORK_QUEUE_${action}`,
        module: 'WorkQueue',
        recordId: String(taskId),
        beforeValue: task.ActionKey,
        afterValue: action + ': ' + (data.comments || '') + (data.meta ? ' ' + JSON.stringify(data.meta) : ''),
        empId: task.TargetEmpID,
        regionCode: task.RegionCode,
        source: 'Work Queue',
      });

      return {
        success: true,
        taskId,
        action,
        complianceResult: result,
      };
    } else if (task.SourceModule === 'Letter') {
      const letterId = Number(task.SourceID);
      const letterAction = action === 'REJECT' ? 'REJECT' : 'APPROVE';
      const result = await this.letterService.generateAndIssueLetter(
        letterId,
        {
          action: letterAction,
          remarks: data.comments,
          customContent: data.meta?.customContent,
        },
        user,
      );

      // Audit
      await this.auditService.log({
        actorEmpId: user.empId,
        actorName: user.name,
        actorRole: user.role,
        action: `WORK_QUEUE_LETTER_${letterAction}`,
        module: 'WorkQueue',
        recordId: String(taskId),
        beforeValue: 'HR_REVIEW',
        afterValue: letterAction + ': ' + (data.comments || ''),
        empId: task.TargetEmpID,
        regionCode: task.RegionCode,
        source: 'Work Queue',
      });

      return {
        success: true,
        taskId,
        action: letterAction,
        letterResult: result,
      };
    } else if (task.SourceModule === 'Request') {
      const reqId = Number(task.SourceID);
      const reqAction = action === 'REJECT' ? 'REJECT' : 'APPROVE';
      const result = await this.requestService.processApproval(
        reqId,
        {
          action: reqAction,
          remarks: data.comments,
        },
        user,
      );

      // Audit
      await this.auditService.log({
        actorEmpId: user.empId,
        actorName: user.name,
        actorRole: user.role,
        action: `WORK_QUEUE_REQUEST_${reqAction}`,
        module: 'WorkQueue',
        recordId: String(taskId),
        beforeValue: task.ActionKey,
        afterValue: reqAction + ': ' + (data.comments || ''),
        empId: task.TargetEmpID,
        regionCode: task.RegionCode,
        source: 'Work Queue',
      });

      return {
        success: true,
        taskId,
        action: reqAction,
        requestResult: result,
      };
    } else {
      // Standalone or generic task completion
      await this.databaseService.query(
        `
          UPDATE dbo.WorkQueueTask
          SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
          WHERE TaskID = @taskId;
        `,
        { taskId, empId: user.empId },
      );

      await this.auditService.log({
        actorEmpId: user.empId,
        actorName: user.name,
        actorRole: user.role,
        action: 'COMPLETE_TASK',
        module: 'WorkQueue',
        recordId: String(taskId),
        afterValue: JSON.stringify(data),
        empId: task.TargetEmpID,
        regionCode: task.RegionCode,
        source: 'Work Queue',
      });

      return { success: true, taskId, action };
    }
  }
}
