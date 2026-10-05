import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { SlaService } from '../sla/sla.service';
import { AuthUser } from '../auth/auth.types';

export interface ComplianceCaseRecord {
  CaseID: number;
  CaseNumber: string;
  EmpID: number;
  RegionCode: string;
  EntityID: number | null;
  EventCode: string;
  PipelineCode: string;
  CurrentStageKey: string;
  Status: string;
  Priority: string;
  TriggerDate: string;
  DueDate: string;
  TargetCompletionDate: string | null;
  AssignedRole: string;
  AssignedEmpID: number | null;
  BlockReason: string | null;
  Source: string;
  MetaJson: string | null;
  CreatedAt: Date;
  ClosedAt: Date | null;
  // Joined employee fields
  FirstName?: string;
  LastName?: string;
  DepartmentID?: number;
  Designation?: string;
  UAEEmployeeCategory?: string;
  IqamaNumber?: string;
  IqamaExpiry?: string;
  VisaNumber?: string;
  VisaExpiry?: string;
  ContractExpiry?: string;
  ContractRenewalCount?: number;
  IsSaudiNational?: boolean;
  JoiningDate?: string;
  EntityName?: string;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly slaService: SlaService,
  ) {}

  // 1. Compliance Configuration
  async getComplianceConfig(): Promise<any> {
    const rows = await this.databaseService.query<any>(
      `SELECT ConfigKey, ConfigValue, Description FROM dbo.SystemConfig;`,
    );
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.ConfigKey] = r.ConfigValue;
    }

    let vendorRoster: any[] = [];
    try {
      if (map['ksaVendorRoster']) {
        vendorRoster = JSON.parse(map['ksaVendorRoster']);
      }
    } catch (e) {
      this.logger.warn('Failed to parse ksaVendorRoster JSON', e);
    }

    return {
      ksaContractRenewalLeadDays: Number(map['ksaContractRenewalLeadDays'] || 75),
      ksaContractTargetBeforeExpiry: Number(map['ksaContractTargetBeforeExpiry'] || 60),
      ksaIqama12mFee: Number(map['ksaIqama12mFee'] || 10350),
      ksaIqama6mFee: Number(map['ksaIqama6mFee'] || 5175),
      ksaIqama3mFee: Number(map['ksaIqama3mFee'] || 2588),
      ksaExitReentryValidityDays: Number(map['ksaExitReentryValidityDays'] || 60),
      uaeVisaStandardLeadDays: Number(map['uaeVisaStandardLeadDays'] || 90),
      uaeVisaExecutiveLeadDays: Number(map['uaeVisaExecutiveLeadDays'] || 180),
      passportExpiryReminderDays: map['passportExpiryReminderDays'] || '210,90,30',
      outboundVisaLeadDays: Number(map['outboundVisaLeadDays'] || 60),
      peopleStrongEnabled: map['peopleStrongEnabled'] === 'true',
      vendorRoster,
    };
  }

  // 2. Overview Stats for Dashboard
  async getStats(user?: AuthUser, regionCode?: string): Promise<{
    total: number;
    active: number;
    pendingAction: number;
    nearDue: number;
    overdue: number;
    closed: number;
  }> {
    let whereClause = 'WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (regionCode && regionCode !== 'all') {
      whereClause += ' AND c.RegionCode = @regionCode';
      params.regionCode = regionCode;
    }

    if (user?.role === 'EMPLOYEE') {
      whereClause += ' AND c.EmpID = @userEmpId';
      params.userEmpId = user.empId;
    } else if (user?.role === 'HOD') {
      whereClause += ' AND (e.ReportsToEmpID = @userEmpId OR c.EmpID = @userEmpId)';
      params.userEmpId = user.empId;
    } else if (user?.role === 'HR' && user.subsidiaryId) {
      whereClause += ' AND (c.RegionCode = @hrRegion OR c.RegionCode = @hrRegionAlt)';
      params.hrRegion = user.subsidiaryId;
      params.hrRegionAlt = user.subsidiaryId === 'saudi' ? 'KSA' : user.subsidiaryId === 'uae' ? 'UAE' : user.subsidiaryId;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    params.today = todayStr;

    const baseSql = `
      FROM dbo.ComplianceCase c
      INNER JOIN dbo.Employee e ON c.EmpID = e.EmpID
      ${whereClause}
    `;

    // Role-specific pending action condition
    let pendingActionCond = `c.Status IN ('OPEN', 'IN_PROGRESS')`;
    if (user?.role === 'EMPLOYEE') {
      pendingActionCond += ` AND c.AssignedRole = 'EMPLOYEE' AND c.EmpID = @userEmpId`;
    } else if (user?.role === 'HOD') {
      pendingActionCond += ` AND c.AssignedRole = 'HOD'`;
    } else if (user?.role === 'HR') {
      pendingActionCond += ` AND c.AssignedRole = 'HR'`;
    }

    const query = `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN c.Status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN ${pendingActionCond} THEN 1 ELSE 0 END) AS pendingAction,
        SUM(CASE WHEN c.Status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND c.DueDate >= CAST(@today AS DATE) AND c.DueDate <= DATEADD(day, 3, CAST(@today AS DATE)) THEN 1 ELSE 0 END) AS nearDue,
        SUM(CASE WHEN c.Status IN ('OPEN', 'IN_PROGRESS', 'BLOCKED') AND c.DueDate < CAST(@today AS DATE) THEN 1 ELSE 0 END) AS overdue,
        SUM(CASE WHEN c.Status IN ('COMPLETED', 'CANCELLED') THEN 1 ELSE 0 END) AS closed
      ${baseSql};
    `;

    const res = await this.databaseService.queryOne<{
      total: number;
      active: number;
      pendingAction: number;
      nearDue: number;
      overdue: number;
      closed: number;
    }>(query, params);

    return {
      total: res?.total || 0,
      active: res?.active || 0,
      pendingAction: res?.pendingAction || 0,
      nearDue: res?.nearDue || 0,
      overdue: res?.overdue || 0,
      closed: res?.closed || 0,
    };
  }

  // 3. Find All Cases with expanded search, filters, sorting, and pagination
  async findAll(filters: {
    regionCode?: string;
    status?: string;
    eventCode?: string;
    priority?: string;
    assignedRole?: string;
    period?: string;
    search?: string;
    sort?: string;
    order?: 'ASC' | 'DESC';
    empId?: number;
    page?: number;
    limit?: number;
    user?: AuthUser;
  }): Promise<any> {
    let whereClause = 'WHERE 1=1';
    const params: Record<string, unknown> = {};

    if (filters.regionCode && filters.regionCode !== 'all') {
      whereClause += ' AND c.RegionCode = @regionCode';
      params.regionCode = filters.regionCode;
    }
    if (filters.status && filters.status !== 'all') {
      whereClause += ' AND c.Status = @status';
      params.status = filters.status;
    }
    if (filters.eventCode && filters.eventCode !== 'all') {
      whereClause += ' AND c.EventCode = @eventCode';
      params.eventCode = filters.eventCode;
    }
    if (filters.priority && filters.priority !== 'all') {
      whereClause += ' AND c.Priority = @priority';
      params.priority = filters.priority;
    }
    if (filters.assignedRole && filters.assignedRole !== 'all') {
      whereClause += ' AND c.AssignedRole = @assignedRole';
      params.assignedRole = filters.assignedRole;
    }
    if (filters.empId) {
      whereClause += ' AND c.EmpID = @empId';
      params.empId = filters.empId;
    }

    // Expiry Period filtering
    if (filters.period && filters.period !== 'all') {
      if (filters.period === '30') {
        whereClause += ' AND c.DueDate <= DATEADD(day, 30, CAST(GETDATE() AS DATE))';
      } else if (filters.period === '60') {
        whereClause += ' AND c.DueDate <= DATEADD(day, 60, CAST(GETDATE() AS DATE))';
      } else if (filters.period === '90') {
        whereClause += ' AND c.DueDate <= DATEADD(day, 90, CAST(GETDATE() AS DATE))';
      } else if (filters.period === 'overdue') {
        whereClause += ' AND c.DueDate < CAST(GETDATE() AS DATE) AND c.Status NOT IN (\'COMPLETED\', \'CANCELLED\')';
      }
    }

    // Substring Search
    if (filters.search && filters.search.trim()) {
      whereClause += ` AND (
        e.FirstName LIKE @search
        OR e.LastName LIKE @search
        OR (e.FirstName + ' ' + e.LastName) LIKE @search
        OR c.CaseNumber LIKE @search
        OR CAST(c.EmpID AS varchar) LIKE @search
        OR c.EventCode LIKE @search
      )`;
      params.search = `%${filters.search.trim()}%`;
    }

    // Role-based scope
    const user = filters.user;
    if (user?.role === 'EMPLOYEE') {
      whereClause += ' AND c.EmpID = @userEmpId';
      params.userEmpId = user.empId;
    } else if (user?.role === 'HOD') {
      whereClause += ' AND (e.ReportsToEmpID = @userEmpId OR c.EmpID = @userEmpId)';
      params.userEmpId = user.empId;
    } else if (user?.role === 'HR' && user.subsidiaryId) {
      whereClause += ' AND (c.RegionCode = @hrRegion OR c.RegionCode = @hrRegionAlt)';
      params.hrRegion = user.subsidiaryId;
      params.hrRegionAlt = user.subsidiaryId === 'saudi' ? 'KSA' : user.subsidiaryId === 'uae' ? 'UAE' : user.subsidiaryId;
    }

    // Sorting
    const orderDir = filters.order === 'ASC' ? 'ASC' : 'DESC';
    let orderBy = 'c.CaseID DESC';
    if (filters.sort === 'dueDate') {
      orderBy = `c.DueDate ${orderDir}, c.CaseID DESC`;
    } else if (filters.sort === 'triggerDate') {
      orderBy = `c.TriggerDate ${orderDir}, c.CaseID DESC`;
    } else if (filters.sort === 'priority') {
      orderBy = `CASE c.Priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END ${orderDir}, c.CaseID DESC`;
    } else if (filters.sort === 'daysRemaining') {
      orderBy = `DATEDIFF(day, GETDATE(), c.DueDate) ${orderDir}, c.CaseID DESC`;
    }

    // Base query
    const fromAndWhere = `
      FROM dbo.ComplianceCase c
      INNER JOIN dbo.Employee e ON c.EmpID = e.EmpID
      LEFT JOIN dbo.EntityMaster ent ON c.EntityID = ent.EntityID
      ${whereClause}
    `;

    // Total Count
    const totalRow = await this.databaseService.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count ${fromAndWhere}`,
      params,
    );
    const total = totalRow?.count || 0;

    let paginationClause = '';
    if (filters.page && filters.limit) {
      const offset = (filters.page - 1) * filters.limit;
      paginationClause = `OFFSET ${offset} ROWS FETCH NEXT ${filters.limit} ROWS ONLY`;
    }

    const selectSql = `
      SELECT
        c.CaseID,
        c.CaseNumber,
        c.EmpID,
        c.RegionCode,
        c.EntityID,
        c.EventCode,
        c.PipelineCode,
        c.CurrentStageKey,
        c.Status,
        c.Priority,
        CONVERT(varchar(10), c.TriggerDate, 23) AS TriggerDate,
        CONVERT(varchar(10), c.DueDate, 23) AS DueDate,
        CONVERT(varchar(10), c.TargetCompletionDate, 23) AS TargetCompletionDate,
        c.AssignedRole,
        c.AssignedEmpID,
        c.BlockReason,
        c.Source,
        c.MetaJson,
        c.CreatedAt,
        c.ClosedAt,
        e.FirstName,
        e.LastName,
        e.DepartmentID,
        e.Designation,
        e.UAEEmployeeCategory,
        e.IqamaNumber,
        CONVERT(varchar(10), e.IqamaExpiry, 23) AS IqamaExpiry,
        e.VisaNumber,
        CONVERT(varchar(10), e.VisaExpiry, 23) AS VisaExpiry,
        CONVERT(varchar(10), e.ContractExpiry, 23) AS ContractExpiry,
        e.ContractRenewalCount,
        e.IsSaudiNational,
        CONVERT(varchar(10), e.JoiningDate, 23) AS JoiningDate,
        ent.EntityName
      ${fromAndWhere}
      ORDER BY ${orderBy}
      ${paginationClause};
    `;

    const records = await this.databaseService.query<ComplianceCaseRecord>(selectSql, params);

    if (filters.page && filters.limit) {
      return {
        data: records,
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      };
    }

    return records;
  }

  // 4. Find Case by ID with Timeline, Checklist, Dependencies, and Documents
  async findById(id: number, user?: AuthUser): Promise<any> {
    const c = await this.databaseService.queryOne<ComplianceCaseRecord>(
      `
        SELECT
          c.*,
          CONVERT(varchar(10), c.TriggerDate, 23) AS TriggerDate,
          CONVERT(varchar(10), c.DueDate, 23) AS DueDate,
          CONVERT(varchar(10), c.TargetCompletionDate, 23) AS TargetCompletionDate,
          e.FirstName,
          e.LastName,
          e.DepartmentID,
          e.Designation,
          e.UAEEmployeeCategory,
          e.IqamaNumber,
          CONVERT(varchar(10), e.IqamaExpiry, 23) AS IqamaExpiry,
          e.VisaNumber,
          CONVERT(varchar(10), e.VisaExpiry, 23) AS VisaExpiry,
          CONVERT(varchar(10), e.ContractExpiry, 23) AS ContractExpiry,
          e.ContractRenewalCount,
          e.IsSaudiNational,
          CONVERT(varchar(10), e.JoiningDate, 23) AS JoiningDate,
          e.ReportsToEmpID,
          ent.EntityName
        FROM dbo.ComplianceCase c
        INNER JOIN dbo.Employee e ON c.EmpID = e.EmpID
        LEFT JOIN dbo.EntityMaster ent ON c.EntityID = ent.EntityID
        WHERE c.CaseID = @id;
      `,
      { id },
    );

    if (!c) throw new NotFoundException('Compliance case not found');

    if (user?.role === 'EMPLOYEE' && c.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied to this case');
    }
    if (user?.role === 'HOD' && c.EmpID !== user.empId && (c as any).ReportsToEmpID !== user.empId) {
      throw new ForbiddenException('Access denied: not in your team');
    }
    if (user?.role === 'HR' && user.subsidiaryId) {
      const match =
        c.RegionCode === user.subsidiaryId ||
        (user.subsidiaryId === 'saudi' && c.RegionCode === 'KSA') ||
        (user.subsidiaryId === 'uae' && c.RegionCode === 'UAE');
      if (!match) {
        throw new ForbiddenException('Access denied: case is outside your authorized region');
      }
    }

    const history = await this.databaseService.query(
      `SELECT * FROM dbo.CaseStageHistory WHERE CaseID = @id ORDER BY HistoryID ASC;`,
      { id },
    );
    const checklist = await this.databaseService.query(
      `SELECT * FROM dbo.CaseChecklistProgress WHERE CaseID = @id ORDER BY ProgressID ASC;`,
      { id },
    );
    const dependencies = await this.databaseService.query(
      `SELECT * FROM dbo.CaseDependency WHERE CaseID = @id ORDER BY DependencyID ASC;`,
      { id },
    );
    const stages = await this.databaseService.query(
      `SELECT * FROM dbo.PipelineStageMaster WHERE PipelineCode = @pipelineCode ORDER BY SequenceOrder ASC;`,
      { pipelineCode: c.PipelineCode },
    );
    const documents = await this.databaseService.query(
      `SELECT * FROM dbo.DocumentMaster WHERE SourceModule = 'Compliance' AND SourceID = @sourceId ORDER BY DocumentID DESC;`,
      { sourceId: String(id) },
    );

    return {
      case: c,
      history,
      checklist,
      dependencies,
      stages,
      documents,
    };
  }

  // 5. Create Case with Event Specific Rules (Exit/Re-Entry, Open Contract, Outbound Visa, etc.)
  async createCase(data: {
    empId: number;
    regionCode?: string;
    eventCode: string;
    pipelineCode?: string;
    priority?: string;
    triggerDate?: string;
    dueDate?: string;
    meta?: any;
    user?: AuthUser;
  }): Promise<ComplianceCaseRecord> {
    const emp = await this.databaseService.queryOne<any>(
      `
        SELECT
          EmpID,
          FirstName,
          LastName,
          SubsidiaryID,
          EntityID,
          UAEEmployeeCategory,
          IqamaNumber,
          CONVERT(varchar(10), IqamaExpiry, 23) AS IqamaExpiry,
          CONVERT(varchar(10), JoiningDate, 23) AS JoiningDate,
          ContractRenewalCount,
          IsSaudiNational
        FROM dbo.Employee
        WHERE EmpID = @empId;
      `,
      { empId: data.empId },
    );
    if (!emp) throw new NotFoundException('Employee not found');

    // Role boundary: employee self-service Exit/Re-Entry and Outbound Visa
    if (data.user?.role === 'EMPLOYEE' && data.user.empId !== data.empId) {
      throw new ForbiddenException('Employees can only initiate compliance cases for themselves');
    }

    const regionCode = data.regionCode || emp.SubsidiaryID || 'uae';

    // Map default pipeline from eventCode if not provided
    let pipelineCode = data.pipelineCode;
    if (!pipelineCode) {
      const pipelineMap: Record<string, string> = {
        KSA_CONTRACT_RENEWAL: 'KSA_CONTRACT_FIXED',
        KSA_OPEN_CONTRACT: 'KSA_OPEN_CONTRACT',
        KSA_IQAMA_RENEWAL: 'KSA_IQAMA',
        KSA_EXIT_REENTRY: 'KSA_EXIT_REENTRY_PIPE',
        KSA_AIRFARE: 'KSA_AIRFARE_PIPE',
        UAE_VISA_RENEWAL: 'UAE_VISA_WORK_PERMIT',
        OUTBOUND_VISA_RENEWAL: 'OUTBOUND_VISA_PIPE',
      };
      pipelineCode = pipelineMap[data.eventCode] || 'UAE_VISA_WORK_PERMIT';
    }

    const firstStage = await this.databaseService.queryOne<any>(
      `SELECT TOP 1 * FROM dbo.PipelineStageMaster WHERE PipelineCode = @pipelineCode ORDER BY SequenceOrder ASC;`,
      { pipelineCode },
    );

    const stageKey = firstStage ? firstStage.StageKey : 'INITIAL';
    const assignedRole = firstStage ? firstStage.ActorRole : 'HR';

    const maxRes = await this.databaseService.queryOne<{ maxId: number }>(
      `SELECT ISNULL(MAX(CaseID), 0) AS maxId FROM dbo.ComplianceCase;`,
    );
    let nextNum = (maxRes?.maxId ?? 0) + 1;
    let caseNum = `CASE-${regionCode.toUpperCase()}-${String(nextNum).padStart(4, '0')}`;
    let attempts = 0;
    while (attempts < 20) {
      const existingCase = await this.databaseService.queryOne(
        `SELECT CaseID FROM dbo.ComplianceCase WHERE CaseNumber = @caseNum;`,
        { caseNum },
      );
      if (!existingCase) break;
      nextNum++;
      caseNum = `CASE-${regionCode.toUpperCase()}-${String(nextNum).padStart(4, '0')}`;
      attempts++;
    }

    const triggerDate = data.triggerDate || new Date().toISOString().slice(0, 10);
    const slaDays = firstStage ? firstStage.DefaultSLADays : 3;
    const dayType = firstStage && firstStage.IsBusinessDays ? 'BUSINESS' : 'CALENDAR';
    const dueDate =
      data.dueDate ||
      this.slaService.calculateDueDate(new Date(triggerDate), slaDays, dayType).toISOString().slice(0, 10);

    let initialStatus = 'OPEN';
    let blockReason: string | null = null;
    const caseMeta = { ...(data.meta || {}) };

    // =========================================================================
    // KSA Exit/Re-Entry Visa Specific Validation & Dependency Engine
    // =========================================================================
    if (data.eventCode === 'KSA_EXIT_REENTRY') {
      const today = new Date();
      let diffDays = -999;
      if (emp.IqamaExpiry) {
        const expDate = new Date(emp.IqamaExpiry);
        diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Hard blocking rule: If Iqama expires within 45 days, block case
      if (!emp.IqamaExpiry || diffDays < 45) {
        initialStatus = 'BLOCKED';
        blockReason = `Hard blocking rule: Iqama expires within 45 days (${diffDays >= 0 ? diffDays : '0'} days remaining). Minimum 45 days validity required before Exit/Re-Entry Visa issuance.`;
      }

      // Payment rule: Company-paid after work anniversary (tenure >= 365 days), Employee-paid before
      let tenureDays = 0;
      let paymentResp = 'EMPLOYEE_PAID';
      let paymentNote = 'Employee-paid before 1-year work anniversary';
      if (emp.JoiningDate) {
        const joining = new Date(emp.JoiningDate);
        tenureDays = Math.max(0, Math.floor((today.getTime() - joining.getTime()) / (1000 * 60 * 60 * 24)));
        if (tenureDays >= 365) {
          paymentResp = 'COMPANY_PAID';
          paymentNote = `Company-paid after work anniversary (Tenure: ${Math.floor(tenureDays / 365)} yr ${tenureDays % 365} d)`;
        } else {
          paymentNote = `Employee-paid before work anniversary (Tenure: ${tenureDays} days)`;
        }
      }

      caseMeta.paymentResponsibility = paymentResp;
      caseMeta.paymentRuleNote = paymentNote;
      caseMeta.tenureDays = tenureDays;
      caseMeta.visaValidityDays = 60;
      caseMeta.iqamaDaysRemaining = diffDays;
    }

    // =========================================================================
    // KSA Open Contract Termination Scenario Tracking
    // =========================================================================
    if (data.eventCode === 'KSA_OPEN_CONTRACT') {
      caseMeta.supportedScenarios = [
        { code: 'A', label: 'Scenario A: With Notice', compensation: "2 months' notice + 2 months' salary" },
        { code: 'B', label: 'Scenario B: Without Notice', compensation: "4 months' salary" },
      ];
      if (data.meta?.scenario) {
        caseMeta.selectedScenario = data.meta.scenario;
      }
    }

    // Insert new Compliance Case
    const newCase = await this.databaseService.queryOne<ComplianceCaseRecord>(
      `
        INSERT INTO dbo.ComplianceCase (
          CaseNumber,
          EmpID,
          RegionCode,
          EntityID,
          EventCode,
          PipelineCode,
          CurrentStageKey,
          Status,
          Priority,
          TriggerDate,
          DueDate,
          AssignedRole,
          BlockReason,
          Source,
          MetaJson
        )
        OUTPUT INSERTED.*
        VALUES (
          @caseNum,
          @empId,
          @regionCode,
          @entityId,
          @eventCode,
          @pipelineCode,
          @stageKey,
          @initialStatus,
          @priority,
          @triggerDate,
          @dueDate,
          @assignedRole,
          @blockReason,
          @source,
          @metaJson
        );
      `,
      {
        caseNum,
        empId: data.empId,
        regionCode,
        entityId: emp.EntityID || null,
        eventCode: data.eventCode,
        pipelineCode,
        stageKey,
        initialStatus,
        priority: data.priority || 'HIGH',
        triggerDate,
        dueDate,
        assignedRole,
        blockReason,
        source: data.user ? 'Manual / Portal' : 'Compliance Engine Scanner',
        metaJson: JSON.stringify(caseMeta),
      },
    );

    if (!newCase) throw new BadRequestException('Failed to create compliance case');

    // Register dependency for KSA Exit/Re-Entry
    if (data.eventCode === 'KSA_EXIT_REENTRY') {
      await this.databaseService.query(
        `
          INSERT INTO dbo.CaseDependency (CaseID, DependencyType, DependencyRefId, Status, BlockReason)
          VALUES (@caseId, 'IQAMA_VALIDITY', @refId, @depStatus, @blockReason);
        `,
        {
          caseId: newCase.CaseID,
          refId: emp.IqamaNumber || 'IQAMA',
          depStatus: initialStatus === 'BLOCKED' ? 'BLOCKED' : 'SATISFIED',
          blockReason,
        },
      );
    }

    // Seed initial history
    await this.databaseService.query(
      `
        INSERT INTO dbo.CaseStageHistory (
          CaseID, StageKey, StageName, ActorRole, ActorEmpID, ActionTaken, Comments, EnteredAt, SLAStatus
        ) VALUES (
          @caseId, @stageKey, @stageName, @actorRole, @actorEmpId, 'CASE_OPENED', @initComment, SYSDATETIME(), 'ON_TIME'
        );
      `,
      {
        caseId: newCase.CaseID,
        stageKey,
        stageName: firstStage?.StageName || stageKey,
        actorRole: data.user?.role || 'SYSTEM',
        actorEmpId: data.user?.empId || null,
        initComment: blockReason ? `Case initialized with dependency block: ${blockReason}` : 'Case initialized',
      },
    );

    // Initialize closure checklist items if pipeline has them
    const checklistItems = await this.databaseService.query<any>(
      `SELECT * FROM dbo.ClosureChecklistItemMaster WHERE PipelineCode = @pipelineCode;`,
      { pipelineCode },
    );
    for (const item of checklistItems) {
      // Labor conditional rule for Tawjeeh:
      const isLaborOnly = item.ApplicableCondition === 'Labor';
      const isSkilled = emp.UAEEmployeeCategory !== 'Labor';

      if (isLaborOnly && isSkilled) {
        // Mark as auto-completed / N/A for Skilled employees
        await this.databaseService.query(
          `
            INSERT INTO dbo.CaseChecklistProgress (CaseID, ChecklistID, ItemKey, ItemLabel, IsCompleted, CompletedAt)
            VALUES (@caseId, @checklistId, @itemKey, @itemLabel, 1, SYSDATETIME());
          `,
          {
            caseId: newCase.CaseID,
            checklistId: item.ChecklistID,
            itemKey: item.ItemKey,
            itemLabel: `${item.ItemLabel} (N/A - Skilled Employee)`,
          },
        );
      } else {
        await this.databaseService.query(
          `
            INSERT INTO dbo.CaseChecklistProgress (CaseID, ChecklistID, ItemKey, ItemLabel, IsCompleted)
            VALUES (@caseId, @checklistId, @itemKey, @itemLabel, 0);
          `,
          {
            caseId: newCase.CaseID,
            checklistId: item.ChecklistID,
            itemKey: item.ItemKey,
            itemLabel: item.ItemLabel,
          },
        );
      }
    }

    // Create corresponding Work Queue Task
    await this.createWorkQueueTaskForStage(newCase, firstStage, emp);

    // Audit Log
    await this.auditService.log({
      actorEmpId: data.user?.empId || null,
      actorName: data.user?.name || 'System Compliance Engine',
      actorRole: data.user?.role || 'SYSTEM',
      action: 'CREATE_COMPLIANCE_CASE',
      module: 'Compliance',
      recordId: String(newCase.CaseID),
      afterValue: JSON.stringify({
        CaseNumber: caseNum,
        EmpID: data.empId,
        EventCode: data.eventCode,
        Status: initialStatus,
        BlockReason: blockReason,
      }),
      empId: data.empId,
      regionCode,
      source: 'Compliance Engine',
    });

    return newCase;
  }

  // 6. Advance Stage with Hard Block Validations, Vendor Routing & Checklist Checks
  async advanceStage(
    caseId: number,
    action: string,
    comments?: string,
    metaUpdate?: any,
    user?: AuthUser,
  ): Promise<any> {
    const c = await this.databaseService.queryOne<any>(
      `
        SELECT
          c.*,
          e.FirstName,
          e.LastName,
          e.UAEEmployeeCategory,
          e.ReportsToEmpID,
          e.IqamaNumber,
          CONVERT(varchar(10), e.IqamaExpiry, 23) AS IqamaExpiry
        FROM dbo.ComplianceCase c
        INNER JOIN dbo.Employee e ON c.EmpID = e.EmpID
        WHERE c.CaseID = @caseId;
      `,
      { caseId },
    );
    if (!c) throw new NotFoundException('Case not found');

    // Role check: If stage is assigned to HOD, confirm caller has HOD/Admin authority
    if (c.AssignedRole === 'HOD' && user && user.role !== 'ADMIN' && user.role !== 'HOD') {
      throw new ForbiddenException('Only the designated HOD or Administrator can confirm this stage');
    }

    // =========================================================================
    // REJECTION WORKFLOW
    // =========================================================================
    if (action === 'REJECT') {
      // BRD requirement: Mandatory rejection comments
      if (!comments || !comments.trim()) {
        throw new BadRequestException('A reason is mandatory when rejecting a compliance stage');
      }

      await this.databaseService.query(
        `
          UPDATE dbo.ComplianceCase
          SET Status = 'CANCELLED', ClosedAt = SYSDATETIME()
          WHERE CaseID = @caseId;
        `,
        { caseId },
      );

      // Close open work queue tasks
      await this.databaseService.query(
        `
          UPDATE dbo.WorkQueueTask
          SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
          WHERE SourceModule = 'Compliance' AND SourceID = @sourceId AND Status IN ('OPEN', 'IN_PROGRESS');
        `,
        { caseId, sourceId: String(caseId), empId: user?.empId || null },
      );

      // Record in stage history
      await this.databaseService.query(
        `
          UPDATE dbo.CaseStageHistory
          SET CompletedAt = SYSDATETIME(), ActionTaken = 'REJECTED', Comments = @comments
          WHERE CaseID = @caseId AND StageKey = @currentStageKey AND CompletedAt IS NULL;
        `,
        {
          caseId,
          currentStageKey: c.CurrentStageKey,
          comments,
        },
      );

      await this.auditService.log({
        actorEmpId: user?.empId || null,
        actorName: user?.name || 'User',
        actorRole: user?.role || 'HOD',
        action: 'REJECT_COMPLIANCE_STAGE',
        module: 'Compliance',
        recordId: String(caseId),
        beforeValue: c.CurrentStageKey,
        afterValue: 'CANCELLED: ' + comments,
        empId: c.EmpID,
        regionCode: c.RegionCode,
        source: 'Compliance Workflow',
      });

      return { status: 'CANCELLED', message: 'Case rejected and closed with mandatory justification' };
    }

    // =========================================================================
    // HARD BLOCKING RULE FOR KSA EXIT/RE-ENTRY VISA
    // =========================================================================
    if (c.EventCode === 'KSA_EXIT_REENTRY') {
      const today = new Date();
      let diffDays = -999;
      if (c.IqamaExpiry) {
        const expDate = new Date(c.IqamaExpiry);
        diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (c.Status === 'BLOCKED' || diffDays < 45) {
        // Check if Iqama validity was renewed
        if (diffDays < 45) {
          throw new BadRequestException(
            `Hard blocking rule: Iqama expires within 45 days (${diffDays >= 0 ? diffDays : 0} days remaining). Exit/Re-Entry Visa processing cannot proceed to issuance until Iqama is renewed for at least 45 days.`,
          );
        } else {
          // Unblock case
          await this.databaseService.query(
            `
              UPDATE dbo.CaseDependency
              SET Status = 'SATISFIED', BlockReason = NULL
              WHERE CaseID = @caseId AND DependencyType = 'IQAMA_VALIDITY';

              UPDATE dbo.ComplianceCase
              SET BlockReason = NULL, Status = 'IN_PROGRESS'
              WHERE CaseID = @caseId;
            `,
            { caseId },
          );
        }
      }
    }

    // Parse existing MetaJson
    let updatedMeta = c.MetaJson ? JSON.parse(c.MetaJson) : {};
    if (metaUpdate) {
      updatedMeta = { ...updatedMeta, ...metaUpdate };
    }

    // =========================================================================
    // KSA IQAMA RENEWAL: DURATION SELECTION & CONFIGURED FEES
    // =========================================================================
    if (c.CurrentStageKey === 'HOD_DURATION') {
      const rawDuration = metaUpdate?.durationMonths || metaUpdate?.duration || updatedMeta?.durationMonths;
      const duration = Number(rawDuration);
      if (![3, 6, 12].includes(duration)) {
        throw new BadRequestException('Valid Iqama renewal duration must be 3, 6, or 12 months.');
      }

      // Read configured fee from SystemConfig
      const feeRow = await this.databaseService.queryOne<{ ConfigValue: string }>(
        `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = @cfgKey;`,
        { cfgKey: `ksaIqama${duration}mFee` },
      );
      const fee = Number(feeRow?.ConfigValue || (duration === 12 ? 10350 : duration === 6 ? 5175 : 2588));

      updatedMeta.durationMonths = duration;
      updatedMeta.applicableFee = fee;
      updatedMeta.feeCurrency = 'SAR';
    }

    // =========================================================================
    // VENDOR ROUTING & DYNAMIC SLA LOOKUP
    // =========================================================================
    let customSlaDays: number | null = null;
    if (metaUpdate?.vendorId || metaUpdate?.vendor) {
      const vendorId = metaUpdate.vendorId || metaUpdate.vendor;
      const vendorConfigRow = await this.databaseService.queryOne<{ ConfigValue: string }>(
        `SELECT ConfigValue FROM dbo.SystemConfig WHERE ConfigKey = 'ksaVendorRoster';`,
      );
      if (vendorConfigRow?.ConfigValue) {
        try {
          const roster: any[] = JSON.parse(vendorConfigRow.ConfigValue);
          const matched = roster.find((v) => v.id === vendorId || v.name === vendorId);
          if (matched) {
            updatedMeta.vendor = matched;
            updatedMeta.vendorSlaDays = matched.slaDays;
            customSlaDays = matched.slaDays;
          }
        } catch (e) {
          this.logger.warn('Error reading ksaVendorRoster for vendor selection', e);
        }
      }
    }

    // =========================================================================
    // KSA OPEN CONTRACT: SCENARIO SELECTION
    // =========================================================================
    if (c.CurrentStageKey === 'SCENARIO_SELECTION') {
      const scenario = metaUpdate?.scenario || updatedMeta?.selectedScenario;
      if (!scenario || !['A', 'B'].includes(scenario)) {
        throw new BadRequestException('Please select a valid termination scenario: Scenario A (With Notice) or Scenario B (Without Notice)');
      }
      updatedMeta.selectedScenario = scenario;
      updatedMeta.scenarioDescription =
        scenario === 'A'
          ? "Scenario A: With notice (2 months' notice + 2 months' salary)"
          : "Scenario B: Without notice (4 months' salary)";
    }

    // Fetch all pipeline stages to determine next stage
    const stages = await this.databaseService.query<any>(
      `SELECT * FROM dbo.PipelineStageMaster WHERE PipelineCode = @pipelineCode ORDER BY SequenceOrder ASC;`,
      { pipelineCode: c.PipelineCode },
    );

    const currentIndex = stages.findIndex((s) => s.StageKey === c.CurrentStageKey);
    let nextStage: any = null;

    // Finding next stage, considering branch conditions (e.g. Tawjeeh for Labor only)
    for (let i = currentIndex + 1; i < stages.length; i++) {
      const candidate = stages[i];
      if (candidate.IsConditional && candidate.BranchCondition) {
        if (candidate.BranchCondition === 'Labor' && c.UAEEmployeeCategory !== 'Labor') {
          // Skip Tawjeeh for skilled / manager
          continue;
        }
      }
      nextStage = candidate;
      break;
    }

    // =========================================================================
    // UAE CLOSURE CHECKLIST VALIDATION BEFORE CLOSE
    // =========================================================================
    const isClosing = !nextStage || nextStage.StageKey === 'CASE_CLOSED';
    if (isClosing) {
      const pendingChecklist = await this.databaseService.query<any>(
        `
          SELECT * FROM dbo.CaseChecklistProgress
          WHERE CaseID = @caseId AND IsCompleted = 0;
        `,
        { caseId },
      );
      if (pendingChecklist.length > 0) {
        throw new BadRequestException(
          `Cannot close case: Required checklist items pending: ${pendingChecklist.map((i: any) => i.ItemLabel).join(', ')}`,
        );
      }
    }

    // Complete current stage in history
    await this.databaseService.query(
      `
        UPDATE dbo.CaseStageHistory
        SET CompletedAt = SYSDATETIME(), ActionTaken = @action, Comments = @comments
        WHERE CaseID = @caseId AND StageKey = @currentStageKey AND CompletedAt IS NULL;
      `,
      {
        caseId,
        currentStageKey: c.CurrentStageKey,
        action,
        comments: comments || null,
      },
    );

    const nextStageKey = nextStage ? nextStage.StageKey : 'CASE_CLOSED';
    const nextStatus = nextStageKey === 'CASE_CLOSED' ? 'COMPLETED' : 'IN_PROGRESS';
    const nextAssignedRole = nextStage ? nextStage.ActorRole : 'HR';

    // Calculate next due date using vendor SLA or stage default SLA
    const slaDays = customSlaDays !== null ? customSlaDays : nextStage ? nextStage.DefaultSLADays : 2;
    const dayType = nextStage && nextStage.IsBusinessDays ? 'BUSINESS' : 'CALENDAR';
    const nextDueDate = this.slaService.calculateDueDate(new Date(), slaDays, dayType).toISOString().slice(0, 10);

    await this.databaseService.query(
      `
        UPDATE dbo.ComplianceCase
        SET
          CurrentStageKey = @nextStageKey,
          Status = @nextStatus,
          AssignedRole = @nextAssignedRole,
          DueDate = @nextDueDate,
          MetaJson = @metaJson,
          ClosedAt = ${nextStatus === 'COMPLETED' ? 'SYSDATETIME()' : 'NULL'}
        WHERE CaseID = @caseId;
      `,
      {
        caseId,
        nextStageKey,
        nextStatus,
        nextAssignedRole,
        nextDueDate,
        metaJson: JSON.stringify(updatedMeta),
      },
    );

    // Insert new history entry
    await this.databaseService.query(
      `
        INSERT INTO dbo.CaseStageHistory (
          CaseID, StageKey, StageName, ActorRole, ActorEmpID, ActionTaken, Comments, EnteredAt, SLAStatus
        ) VALUES (
          @caseId, @nextStageKey, @stageName, @actorRole, @actorEmpId, 'STAGE_ENTERED', @comments, SYSDATETIME(), 'ON_TIME'
        );
      `,
      {
        caseId,
        nextStageKey,
        stageName: nextStage?.StageName || nextStageKey,
        actorRole: user?.role || 'SYSTEM',
        actorEmpId: user?.empId || null,
        comments: comments || null,
      },
    );

    // Close open work queue tasks for this case
    await this.databaseService.query(
      `
        UPDATE dbo.WorkQueueTask
        SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
        WHERE SourceModule = 'Compliance' AND SourceID = @sourceId AND Status IN ('OPEN', 'IN_PROGRESS');
      `,
      { sourceId: String(caseId), empId: user?.empId || null },
    );

    // If next stage is active, generate next Work Queue Task
    if (nextStage && nextStageKey !== 'CASE_CLOSED') {
      await this.createWorkQueueTaskForStage(
        { ...c, CaseID: caseId, CurrentStageKey: nextStageKey, DueDate: nextDueDate },
        nextStage,
        c,
      );
    }

    // Audit
    await this.auditService.log({
      actorEmpId: user?.empId || null,
      actorName: user?.name || 'User',
      actorRole: user?.role || 'SYSTEM',
      action: 'ADVANCE_COMPLIANCE_STAGE',
      module: 'Compliance',
      recordId: String(caseId),
      beforeValue: c.CurrentStageKey,
      afterValue: nextStageKey,
      empId: c.EmpID,
      regionCode: c.RegionCode,
      source: 'Work Queue / Compliance UI',
    });

    return {
      success: true,
      previousStage: c.CurrentStageKey,
      newStage: nextStageKey,
      status: nextStatus,
      dueDate: nextDueDate,
      meta: updatedMeta,
    };
  }

  // 7. Update Checklist Item
  async updateChecklistItem(
    caseId: number,
    progressId: number,
    isCompleted: boolean,
    documentId?: number,
    user?: AuthUser,
  ) {
    await this.databaseService.query(
      `
        UPDATE dbo.CaseChecklistProgress
        SET
          IsCompleted = @isCompleted,
          CompletedByEmpID = @completedBy,
          CompletedAt = ${isCompleted ? 'SYSDATETIME()' : 'NULL'},
          DocumentID = @documentId
        WHERE ProgressID = @progressId AND CaseID = @caseId;
      `,
      {
        isCompleted: isCompleted ? 1 : 0,
        completedBy: isCompleted ? user?.empId || null : null,
        documentId: documentId || null,
        progressId,
        caseId,
      },
    );

    await this.auditService.log({
      actorEmpId: user?.empId || null,
      actorName: user?.name || 'User',
      actorRole: user?.role || 'HR',
      action: 'UPDATE_CHECKLIST_ITEM',
      module: 'Compliance',
      recordId: String(caseId),
      afterValue: JSON.stringify({ progressId, isCompleted, documentId }),
      source: 'Compliance UI',
    });

    return { success: true };
  }

  // 8. Create Work Queue Task helper
  async createWorkQueueTaskForStage(caseRecord: any, stage: any, employee: any): Promise<void> {
    const actionMap: Record<string, { instruction: string; label: string }> = {
      EXPIRY_DETECTED: {
        instruction: `${caseRecord.EventCode.replace(/_/g, ' ')} detected for ${employee.FirstName} ${employee.LastName}. Initiate review.`,
        label: 'Start Review',
      },
      PENDING_DOCS: {
        instruction: `Please upload renewal documents for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Upload Documents',
      },
      PENDING_HOD: {
        instruction: `Confirm renewal approval and contract terms for team member ${employee.FirstName} ${employee.LastName}.`,
        label: 'Confirm Renewal',
      },
      HOD_CONFIRMATION: {
        instruction: `Confirm fixed-term contract renewal for ${employee.FirstName} ${employee.LastName} (4 business days SLA).`,
        label: 'Confirm Renewal',
      },
      HOD_DURATION: {
        instruction: `Confirm Iqama renewal duration (3, 6, or 12 months) for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Select Duration',
      },
      CONTRACT_DRAFTING: {
        instruction: `Draft renewed employment contract for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Prepare Contract',
      },
      PENDING_SIGNATURE: {
        instruction: `Review and sign employment contract for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Sign Contract',
      },
      WPP_PAYMENT: {
        instruction: `Process WPP Insurance Payment for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Record Payment',
      },
      TAWJEEH: {
        instruction: `Complete mandatory Tawjeeh training session for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Verify Training',
      },
      WORK_PERMIT_PAYMENT: {
        instruction: `Process MOHRE Work Permit Renewal fee for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Process Payment',
      },
      ADMIN_AJEER: {
        instruction: `Process Admin / Ajeer authorization for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Process Ajeer',
      },
      VENDOR_ADMIN: {
        instruction: `Process vendor renewal via Muqeem portal for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Process Vendor',
      },
      FINANCE_PAYMENT: {
        instruction: `Execute government renewal fee payment for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Disburse Fee',
      },
      MEDICAL_APP_DRAFTING: {
        instruction: `Prepare medical fitness test application for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Draft Application',
      },
      PENDING_MEDICAL_TEST: {
        instruction: `Schedule and attend medical fitness screening for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Confirm Test',
      },
      EMIRATES_ID_APP: {
        instruction: `Submit Emirates ID renewal application for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Submit Application',
      },
      RESIDENCE_VISA_RENEWAL: {
        instruction: `Submit residence visa renewal to GDRFA/ICP for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Submit Visa',
      },
      DEPENDENCY_CHECK: {
        instruction: `Validate travel itinerary and Iqama minimum 45-day validity for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Verify Dependencies',
      },
      SCENARIO_SELECTION: {
        instruction: `Select termination settlement scenario (A: With notice / B: Without notice) for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Select Scenario',
      },
      MANAGEMENT_APPROVAL: {
        instruction: `Review and approve termination settlement scenario for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Approve Settlement',
      },
      DOCUMENTS_PREPARATION: {
        instruction: `Upload passport copy and photos for outbound visa renewal of ${employee.FirstName} ${employee.LastName}.`,
        label: 'Upload Visa Docs',
      },
      EMBASSY_SUBMISSION: {
        instruction: `Submit outbound visa application to embassy/consulate for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Submit Application',
      },
      VISA_ISSUANCE: {
        instruction: `Verify issued outbound visa and upload copy for ${employee.FirstName} ${employee.LastName}.`,
        label: 'Upload Visa',
      },
    };

    const actionInfo = actionMap[stage.StageKey] || {
      instruction: `Execute step "${stage.StageName}" for ${employee.FirstName} ${employee.LastName}.`,
      label: 'Proceed',
    };

    let assignedRole = stage.ActorRole;
    let assignedEmpId: number | null = null;
    if (stage.ActorRole === 'EMPLOYEE') {
      assignedEmpId = employee.EmpID;
    } else if (stage.ActorRole === 'HOD') {
      assignedEmpId = employee.ReportsToEmpID || null;
    }

    const slaStatus = this.slaService.getSLAStatus(caseRecord.DueDate);

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
          'Compliance',
          @sourceId,
          @actionKey,
          @targetEmpId,
          @regionCode,
          @assignedRole,
          @assignedEmpId,
          @title,
          @instruction,
          @primaryActionLabel,
          @priority,
          @dueDate,
          @slaStatus,
          'OPEN'
        );
      `,
      {
        sourceId: String(caseRecord.CaseID),
        actionKey: stage.StageKey,
        targetEmpId: employee.EmpID,
        regionCode: caseRecord.RegionCode,
        assignedRole,
        assignedEmpId,
        title: `${employee.FirstName} ${employee.LastName} — ${stage.StageName}`,
        instruction: actionInfo.instruction,
        primaryActionLabel: actionInfo.label,
        priority: caseRecord.Priority || 'HIGH',
        dueDate: caseRecord.DueDate,
        slaStatus,
      },
    );
  }

  // 9. Automated Expiry Scanner (KSA Iqama, KSA Contract, UAE Visa, Passport Expiry, Outbound Visa)
  async scanExpiries(): Promise<{ scanned: number; casesCreated: number; alertsCreated: number }> {
    let casesCreated = 0;
    let alertsCreated = 0;

    const employees = await this.databaseService.query<any>(`
      SELECT
        EmpID,
        FirstName,
        LastName,
        SubsidiaryID,
        EmploymentType,
        UAEEmployeeCategory,
        IqamaExpiry,
        VisaExpiry,
        ContractExpiry,
        ContractRenewalCount,
        IsSaudiNational,
        Status
      FROM dbo.Employee
      WHERE Status = 'Active';
    `);

    const today = new Date();

    // Read system configs
    const configRows = await this.databaseService.query<any>(
      `SELECT ConfigKey, ConfigValue FROM dbo.SystemConfig;`,
    );
    const configMap = Object.fromEntries(configRows.map((r: any) => [r.ConfigKey, r.ConfigValue]));

    const stdUaeLeadDays = Number(configMap['uaeVisaStandardLeadDays'] || 90);
    const execUaeLeadDays = Number(configMap['uaeVisaExecutiveLeadDays'] || 180);
    const ksaContractLeadDays = Number(configMap['ksaContractRenewalLeadDays'] || 75);
    const ksaContractTarget = Number(configMap['ksaContractTargetBeforeExpiry'] || 60);

    for (const emp of employees) {
      const region = emp.SubsidiaryID || 'uae';

      // 1. KSA Iqama Renewal (40 calendar days trigger)
      if (region === 'saudi' && emp.IqamaExpiry) {
        const exp = new Date(emp.IqamaExpiry);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 40 && diffDays >= -30) {
          const existing = await this.databaseService.queryOne(
            `SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = @empId AND EventCode = 'KSA_IQAMA_RENEWAL' AND Status NOT IN ('COMPLETED', 'CANCELLED');`,
            { empId: emp.EmpID },
          );
          if (!existing) {
            await this.createCase({
              empId: emp.EmpID,
              regionCode: 'saudi',
              eventCode: 'KSA_IQAMA_RENEWAL',
              pipelineCode: 'KSA_IQAMA',
              priority: diffDays <= 15 ? 'HIGH' : 'MEDIUM',
            });
            casesCreated++;
          }
        }
      }

      // 2. KSA Contract Renewal (75 calendar days trigger) vs Open Contract (Saudi employees after 3 renewals)
      if (region === 'saudi' && emp.ContractExpiry) {
        const exp = new Date(emp.ContractExpiry);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= ksaContractLeadDays && diffDays >= -30) {
          const isSaudiOpen = emp.IsSaudiNational && (emp.ContractRenewalCount || 0) >= 3;
          const targetEvent = isSaudiOpen ? 'KSA_OPEN_CONTRACT' : 'KSA_CONTRACT_RENEWAL';
          const targetPipe = isSaudiOpen ? 'KSA_OPEN_CONTRACT' : 'KSA_CONTRACT_FIXED';

          const existing = await this.databaseService.queryOne(
            `SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = @empId AND EventCode = @eventCode AND Status NOT IN ('COMPLETED', 'CANCELLED');`,
            { empId: emp.EmpID, eventCode: targetEvent },
          );
          if (!existing) {
            // Target completion 60 days before contract expiry
            const targetDate = new Date(exp);
            targetDate.setDate(targetDate.getDate() - ksaContractTarget);

            await this.createCase({
              empId: emp.EmpID,
              regionCode: 'saudi',
              eventCode: targetEvent,
              pipelineCode: targetPipe,
              priority: diffDays <= 30 ? 'HIGH' : 'MEDIUM',
              meta: {
                targetCompletionDate: targetDate.toISOString().slice(0, 10),
                contractExpiry: emp.ContractExpiry,
                leadTimeDays: ksaContractLeadDays,
              },
            });
            casesCreated++;
          }
        }
      }

      // 3. UAE Visa & Work Permit (90 days standard, 180 days Manager/Executive)
      if (region === 'uae' && emp.VisaExpiry) {
        const exp = new Date(emp.VisaExpiry);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const leadTime = emp.UAEEmployeeCategory === 'Manager' ? execUaeLeadDays : stdUaeLeadDays;
        if (diffDays <= leadTime && diffDays >= -30) {
          const existing = await this.databaseService.queryOne(
            `SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = @empId AND EventCode = 'UAE_VISA_RENEWAL' AND Status NOT IN ('COMPLETED', 'CANCELLED');`,
            { empId: emp.EmpID },
          );
          if (!existing) {
            await this.createCase({
              empId: emp.EmpID,
              regionCode: 'uae',
              eventCode: 'UAE_VISA_RENEWAL',
              pipelineCode: 'UAE_VISA_WORK_PERMIT',
              priority: diffDays <= 30 ? 'HIGH' : 'MEDIUM',
            });
            casesCreated++;
          }
        }
      }
    }

    // 4. UAE Passport Expiry Reminders (210, 90, 30 days) - Independent Reminder Log & Alert
    const passportIntervals = (configMap['passportExpiryReminderDays'] || '210,90,30')
      .split(',')
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => !isNaN(n));

    const passports = await this.databaseService.query<any>(`
      SELECT
        p.PassportID,
        p.EmpID,
        p.PassportNumber,
        p.ExpiryDate,
        e.FirstName,
        e.LastName,
        e.SubsidiaryID
      FROM dbo.PassportDetail p
      INNER JOIN dbo.Employee e ON p.EmpID = e.EmpID
      WHERE p.IsActive = 1 AND e.Status = 'Active';
    `);

    for (const p of passports) {
      if (!p.ExpiryDate) continue;
      const expDate = new Date(p.ExpiryDate);
      const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      for (const interval of passportIntervals) {
        // Trigger condition for interval: diffDays <= interval and diffDays > interval - 30
        const lowerBound = interval === 30 ? 0 : interval - 60;
        if (diffDays <= interval && diffDays > lowerBound) {
          const alertType = `${interval}d`;
          const alreadyLogged = await this.databaseService.queryOne(
            `SELECT AlertID FROM dbo.PassportAlertLog WHERE PassportID = @ppId AND AlertType = @alertType;`,
            { ppId: p.PassportID, alertType },
          );

          if (!alreadyLogged) {
            await this.databaseService.query(
              `
                INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status)
                VALUES (@ppId, @alertType, SYSDATETIME(), 'HR, Employee', 'SENT');
              `,
              { ppId: p.PassportID, alertType },
            );

            // Send in-app notification to employee
            const appUser = await this.databaseService.queryOne<any>(
              `SELECT TOP 1 UserID FROM dbo.AppUser WHERE EmpID = @empId;`,
              { empId: p.EmpID },
            );
            const recipientUserId = appUser ? appUser.UserID : 4; // default to Admin (UserID 4)

            const expDateStr = p.ExpiryDate instanceof Date ? p.ExpiryDate.toISOString().slice(0, 10) : String(p.ExpiryDate).slice(0, 10);

            await this.databaseService.query(
              `
                INSERT INTO dbo.Notification (
                  RecipientUserID, RecipientEmpID, Type, Title, Message, RelatedEntity, RelatedEntityID, IsRead
                ) VALUES (
                  @recipientUserId, @empId, 'PASSPORT_EXPIRY', @title, @msg, 'PassportDetail', @ppId, 0
                );
              `,
              {
                recipientUserId,
                empId: p.EmpID,
                title: `Passport Expiry Alert (${interval} Days)`,
                msg: `Passport ${p.PassportNumber} for ${p.FirstName} ${p.LastName} expires on ${expDateStr} (${diffDays} days remaining).`,
                ppId: p.PassportID,
              },
            );

            alertsCreated++;

          }
        }
      }
    }

    return { scanned: employees.length, casesCreated, alertsCreated };
  }
}
