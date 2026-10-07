import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ReportService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getComplianceStatus(regionCode?: string) {
    let query = `
      SELECT
        c.RegionCode,
        c.EventCode,
        c.Status,
        COUNT(*) AS TotalCases,
        SUM(CASE WHEN c.DueDate < CAST(GETDATE() AS DATE) AND c.Status NOT IN ('COMPLETED', 'CANCELLED') THEN 1 ELSE 0 END) AS OverdueCases
      FROM dbo.ComplianceCase c
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND c.RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` GROUP BY c.RegionCode, c.EventCode, c.Status ORDER BY c.RegionCode, c.EventCode;`;
    return this.databaseService.query(query, params);
  }

  async getOverdueCompliance(regionCode?: string) {
    let query = `
      SELECT
        c.CaseID,
        c.CaseNumber,
        c.RegionCode,
        c.EventCode,
        c.CurrentStageKey,
        c.Status,
        c.Priority,
        CONVERT(varchar(10), c.DueDate, 23) AS DueDate,
        DATEDIFF(day, c.DueDate, GETDATE()) AS DaysOverdue,
        e.FirstName,
        e.LastName,
        e.Designation
      FROM dbo.ComplianceCase c
      INNER JOIN dbo.Employee e ON c.EmpID = e.EmpID
      WHERE c.DueDate < CAST(GETDATE() AS DATE)
        AND c.Status NOT IN ('COMPLETED', 'CANCELLED')
    `;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND c.RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY DaysOverdue DESC;`;
    return this.databaseService.query(query, params);
  }

  async getSLABreaches(regionCode?: string) {
    let query = `
      SELECT
        t.TaskID,
        t.SourceModule,
        t.SourceID,
        t.ActionKey,
        t.RegionCode,
        t.AssignedRole,
        t.Title,
        CONVERT(varchar(10), t.DueDate, 23) AS DueDate,
        t.SLAStatus,
        t.Status,
        e.FirstName AS TargetFirstName,
        e.LastName AS TargetLastName
      FROM dbo.WorkQueueTask t
      INNER JOIN dbo.Employee e ON t.TargetEmpID = e.EmpID
      WHERE (t.SLAStatus = 'BREACHED' OR (t.DueDate < CAST(GETDATE() AS DATE) AND t.Status NOT IN ('COMPLETED')))
    `;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND t.RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY t.DueDate ASC;`;
    return this.databaseService.query(query, params);
  }

  async getWorkQueueSummary(regionCode?: string) {
    let query = `
      SELECT
        t.RegionCode,
        t.AssignedRole,
        t.Status,
        COUNT(*) AS TotalTasks,
        SUM(CASE WHEN t.Priority = 'HIGH' THEN 1 ELSE 0 END) AS HighPriorityTasks,
        SUM(CASE WHEN t.DueDate < CAST(GETDATE() AS DATE) THEN 1 ELSE 0 END) AS OverdueTasks
      FROM dbo.WorkQueueTask t
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND t.RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` GROUP BY t.RegionCode, t.AssignedRole, t.Status;`;
    return this.databaseService.query(query, params);
  }

  async getKsaIqamaCosts() {
    return this.databaseService.query(`
      SELECT
        c.CaseNumber,
        c.EmpID,
        e.FirstName,
        e.LastName,
        e.IqamaNumber,
        CONVERT(varchar(10), e.IqamaExpiry, 23) AS IqamaExpiry,
        c.Status,
        c.MetaJson,
        c.CreatedAt,
        c.ClosedAt
      FROM dbo.ComplianceCase c
      INNER JOIN dbo.Employee e ON c.EmpID = e.EmpID
      WHERE c.EventCode = 'KSA_IQAMA_RENEWAL'
      ORDER BY c.CaseID DESC;
    `);
  }

  async getAdvanceRequestsSummary(regionCode?: string) {
    let query = `
      SELECT
        r.RequestType,
        r.RegionCode,
        r.Status,
        COUNT(*) AS TotalRequests,
        SUM(r.Amount) AS TotalAmount
      FROM dbo.EmployeeRequest r
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND r.RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` GROUP BY r.RequestType, r.RegionCode, r.Status;`;
    return this.databaseService.query(query, params);
  }

  async getLetterRequestsSummary(regionCode?: string) {
    let query = `
      SELECT
        lr.LetterType,
        lr.RegionCode,
        lr.Status,
        COUNT(*) AS TotalCount
      FROM dbo.LetterRequest lr
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND lr.RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` GROUP BY lr.LetterType, lr.RegionCode, lr.Status;`;
    return this.databaseService.query(query, params);
  }

  async getKsaAirfareReport() {
    return this.databaseService.query(`
      SELECT
        c.CaseNumber,
        c.EmpID,
        e.FirstName,
        e.LastName,
        e.Designation,
        e.SubsidiaryID,
        CONVERT(varchar(10), e.JoiningDate, 23) AS JoiningDate,
        DATEDIFF(day, e.JoiningDate, GETDATE()) / 365 AS TenureYears,
        c.CurrentStageKey,
        c.Status,
        c.DueDate,
        c.MetaJson,
        c.CreatedAt,
        c.ClosedAt
      FROM dbo.ComplianceCase c
      INNER JOIN dbo.Employee e ON c.EmpID = e.EmpID
      WHERE c.EventCode IN ('KSA_AIRFARE', 'KSA_BUSINESS_TRAVEL')
      ORDER BY c.CaseID DESC;
    `);
  }
}
