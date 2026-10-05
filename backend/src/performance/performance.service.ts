import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';

export interface PerformanceCommentRecord {
  CommentID: number;
  EmpID: number;
  Comment: string;
  CommentText?: string;
  Sentiment: 'GOOD' | 'BAD';
  Weight: 'NORMAL' | 'HIGH';
  Priority: 'NORMAL' | 'HIGH';
  CreatedByEmpID: number;
  CreatedByName: string;
  CreatedAt: Date;
}

export interface PerformanceOverviewStats {
  totalEmployees: number;
  employeesWithComments: number;
  totalGood: number;
  totalBad: number;
  highWeightCount: number;
}

export interface PerformanceEmployeeRow {
  EmpID: number;
  FirstName: string;
  LastName: string;
  FullName: string;
  DepartmentName: string;
  Designation: string;
  SubsidiaryID: string;
  Status: string;
  CommentCount: number;
  LatestCommentDate: string | null;
  LatestSentiment: string | null;
  LatestWeight: string | null;
}

@Injectable()
export class PerformanceService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  // 1. Overview for Dashboard
  async getOverview(user: AuthUser): Promise<{
    stats: PerformanceOverviewStats;
    employees: PerformanceEmployeeRow[];
  }> {
    let empWhere = "WHERE e.Status != 'Terminated'";
    const params: Record<string, unknown> = {};

    if (user.role === 'EMPLOYEE') {
      empWhere += ' AND e.EmpID = @userEmpId';
      params.userEmpId = user.empId;
    } else if (user.role === 'HOD') {
      empWhere += ' AND (e.ReportsToEmpID = @userEmpId OR e.EmpID = @userEmpId)';
      params.userEmpId = user.empId;
    } else if (user.role === 'HR' && user.subsidiaryId) {
      empWhere += ' AND (e.SubsidiaryID = @userSub OR e.SubsidiaryID = @userSubAlt)';
      params.userSub = user.subsidiaryId;
      params.userSubAlt =
        user.subsidiaryId === 'saudi' ? 'KSA' : user.subsidiaryId === 'uae' ? 'UAE' : user.subsidiaryId;
    }

    // Fetch accessible employees with aggregated comment stats
    const query = `
      SELECT
        e.EmpID,
        e.FirstName,
        e.LastName,
        d.DepartmentName,
        e.Designation,
        e.SubsidiaryID,
        e.Status,
        ISNULL(cStats.CommentCount, 0) AS CommentCount,
        cStats.LatestCommentDate,
        cStats.LatestSentiment,
        cStats.LatestWeight
      FROM dbo.Employee e
      LEFT JOIN dbo.Department d ON e.DepartmentID = d.DepartmentID
      LEFT JOIN (
        SELECT
          EmpID,
          COUNT(*) AS CommentCount,
          CONVERT(varchar(19), MAX(CreatedAt), 120) AS LatestCommentDate,
          (
            SELECT TOP 1 UPPER(pc.Sentiment)
            FROM dbo.PerformanceComment pc
            WHERE pc.EmpID = cInner.EmpID
            ORDER BY pc.CreatedAt DESC, pc.CommentID DESC
          ) AS LatestSentiment,
          (
            SELECT TOP 1 UPPER(pc.Priority)
            FROM dbo.PerformanceComment pc
            WHERE pc.EmpID = cInner.EmpID
            ORDER BY pc.CreatedAt DESC, pc.CommentID DESC
          ) AS LatestWeight
        FROM dbo.PerformanceComment cInner
        GROUP BY EmpID
      ) cStats ON e.EmpID = cStats.EmpID
      ${empWhere}
      ORDER BY ISNULL(cStats.CommentCount, 0) DESC, e.FirstName ASC;
    `;

    const rawEmployees = await this.databaseService.query<any>(query, params);

    const employees: PerformanceEmployeeRow[] = rawEmployees.map((r: any) => ({
      EmpID: Number(r.EmpID),
      FirstName: r.FirstName || '',
      LastName: r.LastName || '',
      FullName: `${r.FirstName || ''} ${r.LastName || ''}`.trim(),
      DepartmentName: r.DepartmentName || 'General',
      Designation: r.Designation || 'Employee',
      SubsidiaryID: r.SubsidiaryID || '',
      Status: r.Status || 'Active',
      CommentCount: Number(r.CommentCount || 0),
      LatestCommentDate: r.LatestCommentDate || null,
      LatestSentiment: r.LatestSentiment || null,
      LatestWeight: r.LatestWeight || null,
    }));

    // Aggregate statistics across accessible employees
    const accessibleEmpIds = employees.map((e) => e.EmpID);
    let totalGood = 0;
    let totalBad = 0;
    let highWeightCount = 0;
    let employeesWithComments = 0;

    if (accessibleEmpIds.length > 0) {
      employeesWithComments = employees.filter((e) => e.CommentCount > 0).length;

      // Aggregates for comments of accessible employees
      const aggRes = await this.databaseService.queryOne<{
        goodCount: number;
        badCount: number;
        highCount: number;
      }>(
        `
          SELECT
            SUM(CASE WHEN UPPER(Sentiment) = 'GOOD' THEN 1 ELSE 0 END) AS goodCount,
            SUM(CASE WHEN UPPER(Sentiment) = 'BAD' THEN 1 ELSE 0 END) AS badCount,
            SUM(CASE WHEN UPPER(Priority) = 'HIGH' THEN 1 ELSE 0 END) AS highCount
          FROM dbo.PerformanceComment
          WHERE EmpID IN (${accessibleEmpIds.join(',')});
        `,
      );

      totalGood = aggRes?.goodCount || 0;
      totalBad = aggRes?.badCount || 0;
      highWeightCount = aggRes?.highCount || 0;
    }

    return {
      stats: {
        totalEmployees: employees.length,
        employeesWithComments,
        totalGood,
        totalBad,
        highWeightCount,
      },
      employees,
    };
  }

  // 2. Retrieve Employee Performance Timeline
  async getComments(
    empId: number,
    user: AuthUser,
    filters?: {
      sentiment?: string;
      weight?: string;
      fromDate?: string;
      toDate?: string;
      author?: string;
    },
  ): Promise<PerformanceCommentRecord[]> {
    // Check employee existence
    const emp = await this.databaseService.queryOne<any>(
      `SELECT EmpID, ReportsToEmpID, SubsidiaryID FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId },
    );
    if (!emp) throw new NotFoundException('Employee not found');

    // Role-based permission checks
    if (user.role === 'EMPLOYEE' && user.empId !== empId) {
      throw new ForbiddenException('Access denied: You can only view your own performance timeline');
    }
    if (user.role === 'HOD') {
      if (emp.ReportsToEmpID !== user.empId && empId !== user.empId) {
        throw new ForbiddenException('Access denied: Employee is not in your authorized team');
      }
    }
    if (user.role === 'HR' && user.subsidiaryId) {
      const match =
        emp.SubsidiaryID === user.subsidiaryId ||
        (user.subsidiaryId === 'saudi' && emp.SubsidiaryID === 'KSA') ||
        (user.subsidiaryId === 'uae' && emp.SubsidiaryID === 'UAE');
      if (!match) {
        throw new ForbiddenException('Access denied: Employee is outside your authorized region');
      }
    }

    let whereClause = 'WHERE EmpID = @empId';
    const params: Record<string, unknown> = { empId };

    if (filters?.sentiment && filters.sentiment !== 'ALL') {
      whereClause += ' AND UPPER(Sentiment) = @sentiment';
      params.sentiment = filters.sentiment.toUpperCase();
    }
    if (filters?.weight && filters.weight !== 'ALL') {
      whereClause += ' AND UPPER(Priority) = @weight';
      params.weight = filters.weight.toUpperCase();
    }
    if (filters?.fromDate) {
      whereClause += ' AND CreatedAt >= @fromDate';
      params.fromDate = filters.fromDate;
    }
    if (filters?.toDate) {
      whereClause += ' AND CreatedAt <= DATEADD(day, 1, @toDate)';
      params.toDate = filters.toDate;
    }
    if (filters?.author && filters.author.trim()) {
      whereClause += ' AND CreatedByName LIKE @author';
      params.author = `%${filters.author.trim()}%`;
    }

    const rows = await this.databaseService.query<any>(
      `
        SELECT
          CommentID,
          EmpID,
          Comment,
          UPPER(Sentiment) AS Sentiment,
          UPPER(Priority) AS Weight,
          UPPER(Priority) AS Priority,
          CreatedByEmpID,
          CreatedByName,
          CreatedAt
        FROM dbo.PerformanceComment
        ${whereClause}
        ORDER BY CreatedAt DESC, CommentID DESC;
      `,
      params,
    );

    return rows.map((r: any) => ({
      CommentID: Number(r.CommentID),
      EmpID: Number(r.EmpID),
      Comment: r.Comment,
      CommentText: r.Comment,
      Sentiment: r.Sentiment as 'GOOD' | 'BAD',
      Weight: r.Weight as 'NORMAL' | 'HIGH',
      Priority: r.Weight as 'NORMAL' | 'HIGH',
      CreatedByEmpID: Number(r.CreatedByEmpID),
      CreatedByName: r.CreatedByName,
      CreatedAt: r.CreatedAt,
    }));
  }

  // 3. Add Continuous Performance Comment
  async addComment(
    empId: number,
    data: {
      comment: string;
      sentiment: string;
      weight?: string;
      priority?: string;
    },
    user: AuthUser,
  ): Promise<PerformanceCommentRecord> {
    // Role boundary: Employees cannot add comments
    if (user.role === 'EMPLOYEE') {
      throw new ForbiddenException('Employees cannot post performance comments');
    }

    // Check employee existence
    const emp = await this.databaseService.queryOne<any>(
      `SELECT EmpID, ReportsToEmpID, SubsidiaryID FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId },
    );
    if (!emp) throw new NotFoundException('Employee not found');

    // Role boundary: HOD can only add for own team members
    if (user.role === 'HOD') {
      if (emp.ReportsToEmpID !== user.empId) {
        throw new ForbiddenException('HOD can only add comments for own team members');
      }
    }

    // Role boundary: HR can only add for employees within their subsidiary
    if (user.role === 'HR' && user.subsidiaryId) {
      const match =
        emp.SubsidiaryID === user.subsidiaryId ||
        (user.subsidiaryId === 'saudi' && emp.SubsidiaryID === 'KSA') ||
        (user.subsidiaryId === 'uae' && emp.SubsidiaryID === 'UAE');
      if (!match) {
        throw new ForbiddenException('HR can only add comments for employees in authorized region');
      }
    }

    // Validation: Comment text
    if (!data.comment || !data.comment.trim()) {
      throw new BadRequestException('Comment text is required');
    }

    // Validation: Sentiment (GOOD or BAD)
    const rawSentiment = (data.sentiment || '').trim().toUpperCase();
    if (!['GOOD', 'BAD'].includes(rawSentiment)) {
      throw new BadRequestException('Sentiment must be GOOD or BAD');
    }

    // Validation: Weight / Priority (NORMAL or HIGH)
    const rawWeight = (data.weight || data.priority || '').trim().toUpperCase();
    if (!['NORMAL', 'HIGH'].includes(rawWeight)) {
      throw new BadRequestException('Weight must be NORMAL or HIGH');
    }

    const created = await this.databaseService.queryOne<any>(
      `
        INSERT INTO dbo.PerformanceComment (
          EmpID,
          Comment,
          Sentiment,
          Priority,
          CreatedByEmpID,
          CreatedByName,
          CreatedAt
        )
        OUTPUT
          INSERTED.CommentID,
          INSERTED.EmpID,
          INSERTED.Comment,
          UPPER(INSERTED.Sentiment) AS Sentiment,
          UPPER(INSERTED.Priority) AS Weight,
          UPPER(INSERTED.Priority) AS Priority,
          INSERTED.CreatedByEmpID,
          INSERTED.CreatedByName,
          INSERTED.CreatedAt
        VALUES (
          @empId,
          @comment,
          @sentiment,
          @priority,
          @createdByEmpId,
          @createdByName,
          SYSDATETIME()
        );
      `,
      {
        empId,
        comment: data.comment.trim(),
        sentiment: rawSentiment,
        priority: rawWeight,
        createdByEmpId: user.empId,
        createdByName: user.name,
      },
    );

    if (!created) throw new BadRequestException('Failed to add comment');

    // Historical Audit Log
    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'ADD_PERFORMANCE_COMMENT',
      module: 'Performance',
      recordId: String(created.CommentID),
      afterValue: JSON.stringify({
        CommentID: created.CommentID,
        EmpID: empId,
        Sentiment: rawSentiment,
        Weight: rawWeight,
        CommentSnippet: data.comment.trim().slice(0, 150),
      }),
      empId,
      regionCode: emp.SubsidiaryID,
      source: 'Performance Management',
    });

    return {
      CommentID: Number(created.CommentID),
      EmpID: Number(created.EmpID),
      Comment: created.Comment,
      CommentText: created.Comment,
      Sentiment: created.Sentiment as 'GOOD' | 'BAD',
      Weight: created.Weight as 'NORMAL' | 'HIGH',
      Priority: created.Priority as 'NORMAL' | 'HIGH',
      CreatedByEmpID: Number(created.CreatedByEmpID),
      CreatedByName: created.CreatedByName,
      CreatedAt: created.CreatedAt,
    };
  }
}
