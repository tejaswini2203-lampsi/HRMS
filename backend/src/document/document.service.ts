import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import * as fs from 'fs';
import * as path from 'path';

export interface DocumentRecord {
  DocumentID: number;
  Category: string;
  SourceModule: string;
  SourceID: string | null;
  EmpID: number | null;
  RegionCode: string | null;
  FileName: string;
  FilePath: string;
  MimeType: string;
  FileSize: number;
  Version: number;
  IsActiveVersion: boolean;
  UploadedByEmpID: number | null;
  RetentionYears: number;
  ArchivedAt: Date | null;
  CreatedAt: Date;
  // Joined employee
  FirstName?: string;
  LastName?: string;
}

@Injectable()
export class DocumentService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async findAll(filters: {
    category?: string;
    sourceModule?: string;
    sourceId?: string;
    empId?: number;
    regionCode?: string;
    user?: AuthUser;
  }): Promise<DocumentRecord[]> {
    let query = `
      SELECT
        d.*,
        e.FirstName,
        e.LastName
      FROM dbo.DocumentMaster d
      LEFT JOIN dbo.Employee e ON d.EmpID = e.EmpID
      WHERE d.IsActiveVersion = 1
    `;
    const params: Record<string, unknown> = {};

    if (filters.category && filters.category !== 'all') {
      query += ` AND d.Category = @category`;
      params.category = filters.category;
    }
    if (filters.sourceModule) {
      query += ` AND d.SourceModule = @sourceModule`;
      params.sourceModule = filters.sourceModule;
    }
    if (filters.sourceId) {
      query += ` AND d.SourceID = @sourceId`;
      params.sourceId = filters.sourceId;
    }
    if (filters.empId) {
      query += ` AND d.EmpID = @empId`;
      params.empId = filters.empId;
    }
    if (filters.regionCode && filters.regionCode !== 'all') {
      query += ` AND (d.RegionCode = @regionCode OR d.RegionCode IS NULL)`;
      params.regionCode = filters.regionCode;
    }

    // Role filtering: Employee can only see own documents
    const user = filters.user;
    if (user?.role === 'EMPLOYEE') {
      query += ` AND d.EmpID = @userEmpId`;
      params.userEmpId = user.empId;
    } else if (user?.role === 'HOD') {
      query += ` AND (d.EmpID = @userEmpId OR e.ReportsToEmpID = @userEmpId)`;
      params.userEmpId = user.empId;
    }

    query += ` ORDER BY d.DocumentID DESC;`;

    return this.databaseService.query<DocumentRecord>(query, params);
  }

  async findById(id: number, user?: AuthUser): Promise<DocumentRecord> {
    const doc = await this.databaseService.queryOne<
      DocumentRecord & { ReportsToEmpID?: number }
    >(
      `
        SELECT
          d.*,
          e.FirstName,
          e.LastName,
          e.ReportsToEmpID
        FROM dbo.DocumentMaster d
        LEFT JOIN dbo.Employee e ON d.EmpID = e.EmpID
        WHERE d.DocumentID = @id;
      `,
      { id },
    );
    if (!doc) throw new NotFoundException('Document not found');

    if (user) {
      if (user.role === 'EMPLOYEE' && doc.EmpID && doc.EmpID !== user.empId) {
        throw new ForbiddenException(
          "Access denied: You cannot access another employee's private documents",
        );
      }
      if (
        user.role === 'HOD' &&
        doc.EmpID &&
        doc.EmpID !== user.empId &&
        doc.ReportsToEmpID !== user.empId
      ) {
        throw new ForbiddenException(
          'Access denied: You can only access documents of your direct reportees',
        );
      }
    }

    return doc;
  }

  async create(data: {
    category: string;
    sourceModule: string;
    sourceId?: string;
    empId?: number;
    regionCode?: string;
    fileName: string;
    fileContentBase64?: string;
    mimeType?: string;
    user: AuthUser;
  }): Promise<DocumentRecord> {
    let targetEmpId = data.empId || null;
    if (data.user.role === 'EMPLOYEE') {
      targetEmpId = data.user.empId;
    }

    let regionCode = data.regionCode || null;
    if (targetEmpId && !regionCode) {
      const emp = await this.databaseService.queryOne<any>(
        `SELECT SubsidiaryID FROM dbo.Employee WHERE EmpID = @empId;`,
        { empId: targetEmpId },
      );
      if (emp?.SubsidiaryID) {
        regionCode = emp.SubsidiaryID;
      }
    }

    const fileName = data.fileName;
    const mimeType = data.mimeType || 'application/pdf';
    let fileSize = 0;
    const storedFileName = `${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(this.uploadDir, storedFileName);

    if (data.fileContentBase64) {
      const buffer = Buffer.from(data.fileContentBase64, 'base64');
      fs.writeFileSync(filePath, buffer);
      fileSize = buffer.length;
    } else {
      // Create empty or placeholder file
      fs.writeFileSync(filePath, Buffer.from(''));
    }

    // Calculate versioning: if employee already has document in this category, increment version
    let version = 1;
    if (targetEmpId && data.category) {
      const prevDoc = await this.databaseService.queryOne<{ MaxVersion: number }>(
        `SELECT MAX(Version) AS MaxVersion FROM dbo.DocumentMaster WHERE EmpID = @empId AND Category = @category;`,
        { empId: targetEmpId, category: data.category },
      );
      if (prevDoc && prevDoc.MaxVersion) {
        version = prevDoc.MaxVersion + 1;
        await this.databaseService.query(
          `UPDATE dbo.DocumentMaster SET IsActiveVersion = 0 WHERE EmpID = @empId AND Category = @category AND IsActiveVersion = 1;`,
          { empId: targetEmpId, category: data.category },
        );
      }
    }

    const created = await this.databaseService.queryOne<DocumentRecord>(
      `
        INSERT INTO dbo.DocumentMaster (
          Category,
          SourceModule,
          SourceID,
          EmpID,
          RegionCode,
          FileName,
          FilePath,
          MimeType,
          FileSize,
          Version,
          IsActiveVersion,
          UploadedByEmpID,
          RetentionYears
        )
        OUTPUT INSERTED.*
        VALUES (
          @category,
          @sourceModule,
          @sourceId,
          @empId,
          @regionCode,
          @fileName,
          @filePath,
          @mimeType,
          @fileSize,
          @version,
          1,
          @uploadedBy,
          5
        );
      `,
      {
        category: data.category,
        sourceModule: data.sourceModule || 'General',
        sourceId: data.sourceId || null,
        empId: targetEmpId,
        regionCode,
        fileName,
        filePath,
        mimeType,
        fileSize,
        version,
        uploadedBy: data.user.empId,
      },
    );

    if (!created) throw new BadRequestException('Failed to register document');

    await this.auditService.log({
      actorEmpId: data.user.empId,
      actorName: data.user.name,
      actorRole: data.user.role,
      action: 'UPLOAD_DOCUMENT',
      module: 'Documents',
      recordId: String(created.DocumentID),
      afterValue: JSON.stringify({ fileName, category: data.category, empId: data.empId }),
      empId: data.empId || null,
      regionCode: data.regionCode || null,
      source: 'Document Center',
    });

    return created;
  }
}
