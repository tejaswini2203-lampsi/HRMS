import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { SignatureService } from '../signature/signature.service';
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
  Status: string;
  SignatureStatus: string;
  ParentDocumentID: number | null;
  Description: string | null;
  // Joined fields
  FirstName?: string;
  LastName?: string;
  Designation?: string;
  DepartmentID?: number;
  DepartmentName?: string;
  EmployeeSubsidiary?: string;
  ReportsToEmpID?: number;
  UploaderFirstName?: string;
  UploaderLastName?: string;
  SignerName?: string;
  SignedAt?: Date;
  VerificationHash?: string;
}

export interface DocumentTypeRecord {
  TypeCode: string;
  TypeName: string;
  Category: string;
  DefaultSourceModule: string;
  RequiresSignature: boolean;
  IsActive: boolean;
}

export interface BulkUploadItem {
  empId: number;
  category: string;
  fileName: string;
  fileContentBase64?: string;
  mimeType?: string;
  sourceModule?: string;
  description?: string;
  requiresSignature?: boolean;
}

export interface BulkUploadResult {
  total: number;
  successful: number;
  failed: number;
  results: Array<{
    empId: number;
    fileName: string;
    status: 'SUCCESS' | 'FAILED';
    documentId?: number;
    error?: string;
  }>;
}

@Injectable()
export class DocumentService {
  private readonly uploadDir = path.resolve(process.cwd(), 'uploads');

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly signatureService: SignatureService,
  ) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // 1. Get Document Types Catalog
  async getDocumentTypes(): Promise<DocumentTypeRecord[]> {
    return this.databaseService.query<DocumentTypeRecord>(`
      SELECT TypeCode, TypeName, Category, DefaultSourceModule, RequiresSignature, IsActive
      FROM dbo.DocumentTypeMaster
      WHERE IsActive = 1
      ORDER BY TypeName ASC;
    `);
  }

  // 2. Central Document Search & Filtering with strict Data Scope
  async findAll(filters: {
    category?: string;
    sourceModule?: string;
    sourceId?: string;
    empId?: number;
    regionCode?: string;
    search?: string;
    signatureStatus?: string;
    includeAllVersions?: boolean;
    user?: AuthUser;
  }): Promise<DocumentRecord[]> {
    let query = `
      SELECT
        d.*,
        e.FirstName,
        e.LastName,
        e.Designation,
        e.DepartmentID,
        e.ReportsToEmpID,
        e.SubsidiaryID AS EmployeeSubsidiary,
        dept.DepartmentName,
        u.FirstName AS UploaderFirstName,
        u.LastName AS UploaderLastName,
        (
          SELECT TOP 1 s.SignerName
          FROM dbo.SignatureEvent s
          WHERE s.DocumentID = d.DocumentID
             OR (s.SourceModule = d.SourceModule AND s.SourceID = d.SourceID)
          ORDER BY s.SignatureID DESC
        ) AS SignerName,
        (
          SELECT TOP 1 s.SignedAt
          FROM dbo.SignatureEvent s
          WHERE s.DocumentID = d.DocumentID
             OR (s.SourceModule = d.SourceModule AND s.SourceID = d.SourceID)
          ORDER BY s.SignatureID DESC
        ) AS SignedAt,
        (
          SELECT TOP 1 s.VerificationHash
          FROM dbo.SignatureEvent s
          WHERE s.DocumentID = d.DocumentID
             OR (s.SourceModule = d.SourceModule AND s.SourceID = d.SourceID)
          ORDER BY s.SignatureID DESC
        ) AS VerificationHash
      FROM dbo.DocumentMaster d
      LEFT JOIN dbo.Employee e ON d.EmpID = e.EmpID
      LEFT JOIN dbo.Department dept ON e.DepartmentID = dept.DepartmentID
      LEFT JOIN dbo.Employee u ON d.UploadedByEmpID = u.EmpID
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};

    if (!filters.includeAllVersions) {
      query += ` AND d.IsActiveVersion = 1`;
    }

    if (filters.category && filters.category !== 'all' && filters.category !== 'All') {
      query += ` AND d.Category = @category`;
      params.category = filters.category;
    }
    if (filters.sourceModule && filters.sourceModule !== 'all' && filters.sourceModule !== 'All') {
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
    if (filters.regionCode && filters.regionCode !== 'all' && filters.regionCode !== 'All') {
      const reg = filters.regionCode.toLowerCase();
      if (reg === 'saudi' || reg === 'ksa') {
        query += ` AND (LOWER(d.RegionCode) IN ('saudi', 'ksa') OR d.RegionCode IS NULL)`;
      } else {
        query += ` AND (LOWER(d.RegionCode) = @regionCode OR d.RegionCode IS NULL)`;
        params.regionCode = reg;
      }
    }
    if (filters.signatureStatus && filters.signatureStatus !== 'all' && filters.signatureStatus !== 'All') {
      query += ` AND d.SignatureStatus = @signatureStatus`;
      params.signatureStatus = filters.signatureStatus;
    }
    if (filters.search && filters.search.trim()) {
      query += ` AND (
        d.FileName LIKE @search
        OR e.FirstName LIKE @search
        OR e.LastName LIKE @search
        OR d.Description LIKE @search
      )`;
      params.search = `%${filters.search.trim()}%`;
    }

    // Role-based Access & Data Scope
    const user = filters.user;
    if (user) {
      if (user.role === 'EMPLOYEE') {
        query += ` AND d.EmpID = @userEmpId`;
        params.userEmpId = user.empId;
      } else if (user.role === 'HOD') {
        query += ` AND (
          d.EmpID = @userEmpId
          OR e.ReportsToEmpID = @userEmpId
          OR e.DepartmentID = (SELECT DepartmentID FROM dbo.Employee WHERE EmpID = @userEmpId)
        )`;
        params.userEmpId = user.empId;
      } else if (user.role === 'HR') {
        const sub = (user.subsidiaryId || '').toLowerCase();
        if (sub && sub !== 'all' && sub !== 'corporate') {
          if (sub === 'saudi' || sub === 'ksa') {
            query += ` AND (
              LOWER(d.RegionCode) IN ('saudi', 'ksa')
              OR (d.RegionCode IS NULL AND (LOWER(e.SubsidiaryID) IN ('saudi', 'ksa') OR e.SubsidiaryID IS NULL))
            )`;
          } else {
            query += ` AND (
              LOWER(d.RegionCode) = @hrSub
              OR (d.RegionCode IS NULL AND (LOWER(e.SubsidiaryID) = @hrSub OR e.SubsidiaryID IS NULL))
            )`;
            params.hrSub = sub;
          }
        }
      }
    }

    query += ` ORDER BY d.DocumentID DESC;`;

    return this.databaseService.query<DocumentRecord>(query, params);
  }

  // 3. Find Document by ID with Authorization Enforcement
  async findById(id: number, user?: AuthUser): Promise<DocumentRecord> {
    const doc = await this.databaseService.queryOne<DocumentRecord>(
      `
        SELECT
          d.*,
          e.FirstName,
          e.LastName,
          e.Designation,
          e.DepartmentID,
          e.ReportsToEmpID,
          e.SubsidiaryID AS EmployeeSubsidiary,
          dept.DepartmentName,
          u.FirstName AS UploaderFirstName,
          u.LastName AS UploaderLastName,
          (
            SELECT TOP 1 s.SignerName
            FROM dbo.SignatureEvent s
            WHERE s.DocumentID = d.DocumentID
               OR (s.SourceModule = d.SourceModule AND s.SourceID = d.SourceID)
            ORDER BY s.SignatureID DESC
          ) AS SignerName,
          (
            SELECT TOP 1 s.SignedAt
            FROM dbo.SignatureEvent s
            WHERE s.DocumentID = d.DocumentID
               OR (s.SourceModule = d.SourceModule AND s.SourceID = d.SourceID)
            ORDER BY s.SignatureID DESC
          ) AS SignedAt,
          (
            SELECT TOP 1 s.VerificationHash
            FROM dbo.SignatureEvent s
            WHERE s.DocumentID = d.DocumentID
               OR (s.SourceModule = d.SourceModule AND s.SourceID = d.SourceID)
            ORDER BY s.SignatureID DESC
          ) AS VerificationHash
        FROM dbo.DocumentMaster d
        LEFT JOIN dbo.Employee e ON d.EmpID = e.EmpID
        LEFT JOIN dbo.Department dept ON e.DepartmentID = dept.DepartmentID
        LEFT JOIN dbo.Employee u ON d.UploadedByEmpID = u.EmpID
        WHERE d.DocumentID = @id;
      `,
      { id },
    );
    if (!doc) throw new NotFoundException('Document not found');

    if (user) {
      if (user.role === 'EMPLOYEE' && doc.EmpID && doc.EmpID !== user.empId) {
        await this.auditService.log({
          actorEmpId: user.empId,
          actorName: user.name,
          actorRole: user.role,
          action: 'UNAUTHORIZED_DOCUMENT_ACCESS',
          module: 'Documents',
          recordId: String(id),
          source: 'Security Engine',
        });
        throw new ForbiddenException(
          "Access denied: You cannot access another employee's private documents",
        );
      }

      if (user.role === 'HOD' && doc.EmpID && doc.EmpID !== user.empId) {
        const hodEmp = await this.databaseService.queryOne<{ DepartmentID: number }>(
          `SELECT DepartmentID FROM dbo.Employee WHERE EmpID = @empId;`,
          { empId: user.empId },
        );
        const isReportee = doc.ReportsToEmpID === user.empId;
        const isSameDept = hodEmp && doc.DepartmentID === hodEmp.DepartmentID;
        if (!isReportee && !isSameDept) {
          await this.auditService.log({
            actorEmpId: user.empId,
            actorName: user.name,
            actorRole: user.role,
            action: 'UNAUTHORIZED_DOCUMENT_ACCESS',
            module: 'Documents',
            recordId: String(id),
            source: 'Security Engine',
          });
          throw new ForbiddenException(
            'Access denied: You can only access documents of your direct reportees or department',
          );
        }
      }

      if (user.role === 'HR') {
        const sub = (user.subsidiaryId || '').toLowerCase();
        if (sub && sub !== 'all' && sub !== 'corporate') {
          const docRegion = (doc.RegionCode || doc.EmployeeSubsidiary || '').toLowerCase();
          const isGccPhase1Sub = ['saudi', 'ksa', 'uae'].includes(sub);
          const isGccPhase1Doc = ['saudi', 'ksa', 'uae'].includes(docRegion);
          const match =
            (isGccPhase1Sub && isGccPhase1Doc) ||
            docRegion === sub ||
            (['saudi', 'ksa'].includes(docRegion) && ['saudi', 'ksa'].includes(sub));
          if (docRegion && !match) {
            await this.auditService.log({
              actorEmpId: user.empId,
              actorName: user.name,
              actorRole: user.role,
              action: 'UNAUTHORIZED_DOCUMENT_ACCESS',
              module: 'Documents',
              recordId: String(id),
              source: 'Security Engine',
            });
            throw new ForbiddenException(
              'Access denied: Document is outside your authorized regional jurisdiction',
            );
          }
        }
      }
    }

    return doc;
  }

  // 4. Download / View Document with Audit
  async getDownloadStream(
    id: number,
    user: AuthUser,
  ): Promise<{ filePath: string; fileName: string; mimeType: string }> {
    const doc = await this.findById(id, user);

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'DOWNLOAD_DOCUMENT',
      module: 'Documents',
      recordId: String(doc.DocumentID),
      afterValue: JSON.stringify({
        fileName: doc.FileName,
        category: doc.Category,
        version: doc.Version,
      }),
      empId: doc.EmpID || null,
      regionCode: doc.RegionCode || null,
      source: 'Document Center',
    });

    return {
      filePath: doc.FilePath,
      fileName: doc.FileName,
      mimeType: doc.MimeType || 'application/pdf',
    };
  }

  // 5. Create Standalone / General Document
  async create(data: {
    category: string;
    sourceModule?: string;
    sourceId?: string;
    empId?: number;
    regionCode?: string;
    fileName: string;
    fileContentBase64?: string;
    mimeType?: string;
    description?: string;
    requiresSignature?: boolean;
    parentDocumentId?: number;
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
      fs.writeFileSync(filePath, Buffer.from(''));
    }

    const signatureStatus = data.requiresSignature ? 'PENDING_SIGNATURE' : 'NOT_REQUIRED';

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
          RetentionYears,
          Status,
          SignatureStatus,
          ParentDocumentID,
          Description
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
          1,
          1,
          @uploadedBy,
          5,
          'ACTIVE',
          @signatureStatus,
          @parentDocumentId,
          @description
        );
      `,
      {
        category: data.category,
        sourceModule: data.sourceModule || 'GENERAL',
        sourceId: data.sourceId || null,
        empId: targetEmpId,
        regionCode,
        fileName,
        filePath,
        mimeType,
        fileSize,
        uploadedBy: data.user.empId,
        signatureStatus,
        parentDocumentId: data.parentDocumentId || null,
        description: data.description || null,
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
      afterValue: JSON.stringify({
        fileName,
        category: data.category,
        empId: targetEmpId,
        version: 1,
      }),
      empId: targetEmpId || null,
      regionCode: regionCode || null,
      source: 'Document Center',
    });

    return created;
  }

  // 6. Upload New Version (Platform-Wide Versioning)
  async uploadNewVersion(
    parentDocId: number,
    data: {
      fileName?: string;
      fileContentBase64?: string;
      mimeType?: string;
      description?: string;
      user: AuthUser;
    },
  ): Promise<DocumentRecord> {
    const existingDoc = await this.findById(parentDocId, data.user);
    if (!existingDoc) throw new NotFoundException('Target document not found');

    const rootId = existingDoc.ParentDocumentID || existingDoc.DocumentID;

    // Get max version in lineage
    const maxRow = await this.databaseService.queryOne<{ MaxV: number }>(
      `
        SELECT MAX(Version) AS MaxV
        FROM dbo.DocumentMaster
        WHERE DocumentID = @rootId OR ParentDocumentID = @rootId;
      `,
      { rootId },
    );
    const newVersion = (maxRow?.MaxV || existingDoc.Version || 1) + 1;

    // Deactivate previous versions in lineage
    await this.databaseService.query(
      `
        UPDATE dbo.DocumentMaster
        SET IsActiveVersion = 0
        WHERE DocumentID = @rootId OR ParentDocumentID = @rootId;
      `,
      { rootId },
    );

    const fileName = data.fileName || existingDoc.FileName;
    const mimeType = data.mimeType || existingDoc.MimeType || 'application/pdf';
    let fileSize = 0;
    const storedFileName = `${Date.now()}_v${newVersion}_${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(this.uploadDir, storedFileName);

    if (data.fileContentBase64) {
      const buffer = Buffer.from(data.fileContentBase64, 'base64');
      fs.writeFileSync(filePath, buffer);
      fileSize = buffer.length;
    } else {
      fs.writeFileSync(filePath, Buffer.from(''));
    }

    const nextSigStatus =
      existingDoc.SignatureStatus === 'SIGNED' ? 'PENDING_SIGNATURE' : existingDoc.SignatureStatus;

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
          RetentionYears,
          Status,
          SignatureStatus,
          ParentDocumentID,
          Description
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
          @retentionYears,
          'ACTIVE',
          @signatureStatus,
          @parentDocumentId,
          @description
        );
      `,
      {
        category: existingDoc.Category,
        sourceModule: existingDoc.SourceModule,
        sourceId: existingDoc.SourceID,
        empId: existingDoc.EmpID,
        regionCode: existingDoc.RegionCode,
        fileName,
        filePath,
        mimeType,
        fileSize,
        version: newVersion,
        uploadedBy: data.user.empId,
        retentionYears: existingDoc.RetentionYears || 5,
        signatureStatus: nextSigStatus,
        parentDocumentId: rootId,
        description: data.description || existingDoc.Description,
      },
    );

    if (!created) throw new BadRequestException('Failed to create new document version');

    await this.auditService.log({
      actorEmpId: data.user.empId,
      actorName: data.user.name,
      actorRole: data.user.role,
      action: 'UPLOAD_DOCUMENT_VERSION',
      module: 'Documents',
      recordId: String(created.DocumentID),
      beforeValue: JSON.stringify({
        priorDocumentId: parentDocId,
        priorVersion: existingDoc.Version,
      }),
      afterValue: JSON.stringify({
        newDocumentId: created.DocumentID,
        newVersion,
        fileName,
      }),
      empId: existingDoc.EmpID || null,
      regionCode: existingDoc.RegionCode || null,
      source: 'Document Center',
    });

    return created;
  }

  // 7. Get Version History for Document Lineage
  async getVersionHistory(id: number, user: AuthUser): Promise<DocumentRecord[]> {
    const doc = await this.findById(id, user);
    const rootId = doc.ParentDocumentID || doc.DocumentID;

    return this.databaseService.query<DocumentRecord>(
      `
        SELECT
          d.*,
          u.FirstName AS UploaderFirstName,
          u.LastName AS UploaderLastName,
          s.SignerName,
          s.SignedAt,
          s.VerificationHash
        FROM dbo.DocumentMaster d
        LEFT JOIN dbo.Employee u ON d.UploadedByEmpID = u.EmpID
        LEFT JOIN dbo.SignatureEvent s ON s.DocumentID = d.DocumentID
        WHERE d.DocumentID = @rootId OR d.ParentDocumentID = @rootId
           OR (d.EmpID = @empId AND d.Category = @category AND d.FileName = @fileName)
        ORDER BY d.Version DESC;
      `,
      {
        rootId,
        empId: doc.EmpID || 0,
        category: doc.Category,
        fileName: doc.FileName,
      },
    );
  }

  // 8. Sign Document via Native Signature Capability
  async signDocument(
    docId: number,
    signatureData: string,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const doc = await this.findById(docId, user);

    const sig = await this.signatureService.sign({
      documentId: doc.DocumentID,
      sourceModule: doc.SourceModule || 'GENERAL',
      sourceId: String(doc.DocumentID),
      signatureData,
      user,
      ipAddress,
    });

    await this.databaseService.query(
      `UPDATE dbo.DocumentMaster SET SignatureStatus = 'SIGNED' WHERE DocumentID = @id;`,
      { id: docId },
    );

    return {
      message: 'Document signed successfully',
      signature: sig,
      documentId: docId,
      status: 'SIGNED',
    };
  }

  // 9. Bulk Upload for HR/Admin with Validation & Reporting
  async bulkUpload(
    items: BulkUploadItem[],
    user: AuthUser,
  ): Promise<BulkUploadResult> {
    if (user.role !== 'HR' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only HR and Admin can perform bulk document uploads');
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('No documents provided for bulk upload');
    }

    const results: BulkUploadResult['results'] = [];
    let successful = 0;
    let failed = 0;

    for (const item of items) {
      try {
        if (!item.empId) {
          failed++;
          results.push({
            empId: item.empId,
            fileName: item.fileName || 'Unknown',
            status: 'FAILED',
            error: 'Missing Employee ID',
          });
          continue;
        }

        const emp = await this.databaseService.queryOne<{
          EmpID: number;
          FirstName: string;
          LastName: string;
          SubsidiaryID: string;
        }>(`SELECT EmpID, FirstName, LastName, SubsidiaryID FROM dbo.Employee WHERE EmpID = @empId;`, {
          empId: item.empId,
        });

        if (!emp) {
          failed++;
          results.push({
            empId: item.empId,
            fileName: item.fileName || 'Unknown',
            status: 'FAILED',
            error: `Employee with ID ${item.empId} does not exist`,
          });
          continue;
        }

        // HR Regional jurisdiction check
        if (user.role === 'HR') {
          const hrSub = (user.subsidiaryId || '').toLowerCase();
          const empSub = (emp.SubsidiaryID || '').toLowerCase();
          const match =
            !hrSub ||
            hrSub === 'all' ||
            hrSub === 'corporate' ||
            hrSub === empSub ||
            (['saudi', 'ksa'].includes(hrSub) && ['saudi', 'ksa'].includes(empSub));
          if (!match) {
            failed++;
            results.push({
              empId: item.empId,
              fileName: item.fileName,
              status: 'FAILED',
              error: `Employee ${item.empId} (${empSub.toUpperCase()}) is outside your authorized regional jurisdiction (${hrSub.toUpperCase()})`,
            });
            continue;
          }
        }

        if (!item.fileName || !item.fileName.trim()) {
          failed++;
          results.push({
            empId: item.empId,
            fileName: item.fileName || 'Untitled',
            status: 'FAILED',
            error: 'File name is required',
          });
          continue;
        }

        const category = item.category || 'General';

        const created = await this.create({
          category,
          sourceModule: item.sourceModule || 'GENERAL',
          empId: emp.EmpID,
          regionCode: emp.SubsidiaryID,
          fileName: item.fileName.trim(),
          fileContentBase64: item.fileContentBase64,
          mimeType: item.mimeType || 'application/pdf',
          description: item.description,
          requiresSignature: item.requiresSignature || false,
          user,
        });

        successful++;
        results.push({
          empId: item.empId,
          fileName: item.fileName,
          status: 'SUCCESS',
          documentId: created.DocumentID,
        });
      } catch (err: any) {
        failed++;
        results.push({
          empId: item.empId,
          fileName: item.fileName || 'Unknown',
          status: 'FAILED',
          error: err.message || 'Failed to save document',
        });
      }
    }

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'BULK_UPLOAD_DOCUMENTS',
      module: 'Documents',
      recordId: `BULK_${Date.now()}`,
      afterValue: JSON.stringify({ total: items.length, successful, failed }),
      source: 'Bulk Uploader',
    });

    return {
      total: items.length,
      successful,
      failed,
      results,
    };
  }
}
