import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { SlaService } from '../sla/sla.service';
import { DocumentService } from '../document/document.service';
import { AuthUser } from '../auth/auth.types';
import { generateLetterPdf } from './letter-pdf.generator';

export interface LetterRequestRecord {
  LetterRequestID: number;
  RequestCode: string;
  LetterType: string;
  TemplateID: number | null;
  EmpID: number;
  RegionCode: string;
  Status: string;
  GeneratedDocumentID: number | null;
  RequestedByEmpID: number;
  ReviewerEmpID: number | null;
  SignerEmpID: number | null;
  Remarks: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
  // Joined fields
  FirstName?: string;
  LastName?: string;
  Designation?: string;
  TemplateName?: string;
}

@Injectable()
export class LetterService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly slaService: SlaService,
    private readonly documentService: DocumentService,
  ) {}

  async findAll(
    user: AuthUser,
    filters: {
      letterType?: string;
      status?: string;
      regionCode?: string;
      empId?: number;
    } = {},
  ): Promise<LetterRequestRecord[]> {
    let query = `
      SELECT
        lr.*,
        e.FirstName,
        e.LastName,
        e.Designation,
        t.TemplateName
      FROM dbo.LetterRequest lr
      INNER JOIN dbo.Employee e ON lr.EmpID = e.EmpID
      LEFT JOIN dbo.LetterTemplateMaster t ON lr.TemplateID = t.TemplateID
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};

    if (filters.letterType) {
      query += ` AND lr.LetterType = @letterType`;
      params.letterType = filters.letterType;
    }
    if (filters.status && filters.status !== 'all') {
      query += ` AND lr.Status = @status`;
      params.status = filters.status;
    }
    if (filters.regionCode && filters.regionCode !== 'all') {
      query += ` AND lr.RegionCode = @regionCode`;
      params.regionCode = filters.regionCode;
    }
    if (filters.empId) {
      query += ` AND lr.EmpID = @empId`;
      params.empId = filters.empId;
    }

    if (user.role === 'EMPLOYEE') {
      query += ` AND lr.EmpID = @userEmpId`;
      params.userEmpId = user.empId;
    } else if (user.role === 'HOD') {
      query += ` AND (e.ReportsToEmpID = @userEmpId OR lr.EmpID = @userEmpId)`;
      params.userEmpId = user.empId;
    }

    query += ` ORDER BY lr.LetterRequestID DESC;`;

    return this.databaseService.query<LetterRequestRecord>(query, params);
  }

  async findById(id: number, user: AuthUser): Promise<any> {
    const lr = await this.databaseService.queryOne<any>(
      `
        SELECT
          lr.*,
          e.FirstName,
          e.LastName,
          e.Designation,
          e.JoiningDate,
          e.Salary,
          e.SubsidiaryID,
          t.TemplateName,
          t.Content AS TemplateContent
        FROM dbo.LetterRequest lr
        INNER JOIN dbo.Employee e ON lr.EmpID = e.EmpID
        LEFT JOIN dbo.LetterTemplateMaster t ON lr.TemplateID = t.TemplateID
        WHERE lr.LetterRequestID = @id;
      `,
      { id },
    );
    if (!lr) throw new NotFoundException('Letter request not found');

    if (user.role === 'EMPLOYEE' && lr.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied');
    }

    return lr;
  }

  async createLetterRequest(
    data: {
      letterType: string;
      remarks?: string;
    },
    user: AuthUser,
  ): Promise<LetterRequestRecord> {
    const template = await this.databaseService.queryOne<any>(
      `SELECT * FROM dbo.LetterTemplateMaster WHERE LetterType = @type AND IsActive = 1;`,
      { type: data.letterType },
    );
    if (!template) {
      throw new BadRequestException(`No active letter template found for type "${data.letterType}"`);
    }

    const emp = await this.databaseService.queryOne<any>(
      `SELECT EmpID, FirstName, LastName, SubsidiaryID FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId: user.empId },
    );
    if (!emp) throw new NotFoundException('Employee not found');

    const regionCode = emp.SubsidiaryID || 'uae';
    const countRes = await this.databaseService.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM dbo.LetterRequest;`,
    );
    const requestCode = `LTR-${(countRes?.count ?? 0) + 101}`;

    const created = await this.databaseService.queryOne<LetterRequestRecord>(
      `
        INSERT INTO dbo.LetterRequest (
          RequestCode,
          LetterType,
          TemplateID,
          EmpID,
          RegionCode,
          Status,
          RequestedByEmpID,
          Remarks
        )
        OUTPUT INSERTED.*
        VALUES (
          @requestCode,
          @letterType,
          @templateId,
          @empId,
          @regionCode,
          'PENDING_REVIEW',
          @requestedBy,
          @remarks
        );
      `,
      {
        requestCode,
        letterType: data.letterType,
        templateId: template.TemplateID,
        empId: user.empId,
        regionCode,
        requestedBy: user.empId,
        remarks: data.remarks || null,
      },
    );

    if (!created) throw new BadRequestException('Failed to create letter request');

    // Create Work Queue Task for HR
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
          'Letter',
          @sourceId,
          'HR_REVIEW',
          @targetEmpId,
          @regionCode,
          'HR',
          @title,
          @instruction,
          'Review Letter',
          'MEDIUM',
          @dueDate,
          'ON_TIME',
          'OPEN'
        );
      `,
      {
        sourceId: String(created.LetterRequestID),
        targetEmpId: user.empId,
        regionCode,
        title: `${user.name} — ${data.letterType}`,
        instruction: `Review and generate ${data.letterType} for ${user.name}.`,
        dueDate,
      },
    );

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'REQUEST_LETTER',
      module: 'Letters',
      recordId: String(created.LetterRequestID),
      afterValue: data.letterType,
      empId: user.empId,
      regionCode,
      source: 'Letter Service',
    });

    return created;
  }

  async generateAndIssueLetter(
    requestId: number,
    data: {
      action: 'APPROVE' | 'REJECT';
      signatureData?: string;
      customContent?: string;
      remarks?: string;
    },
    user: AuthUser,
  ): Promise<any> {
    const lr = await this.findById(requestId, user);

    if (data.action === 'REJECT') {
      await this.databaseService.query(
        `
          UPDATE dbo.LetterRequest
          SET Status = 'REJECTED', Remarks = @remarks, UpdatedAt = SYSDATETIME()
          WHERE LetterRequestID = @id;
        `,
        { id: requestId, remarks: data.remarks || null },
      );

      await this.databaseService.query(
        `
          UPDATE dbo.WorkQueueTask
          SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
          WHERE SourceModule = 'Letter' AND SourceID = @sourceId AND Status IN ('OPEN', 'IN_PROGRESS');
        `,
        { sourceId: String(requestId), empId: user.empId },
      );

      return { success: true, status: 'REJECTED' };
    }

    // Guard: Prevent duplicate document generation on repeated clicks
    if (lr.Status === 'ISSUED' && lr.GeneratedDocumentID) {
      return {
        success: true,
        status: 'ISSUED',
        documentId: lr.GeneratedDocumentID,
        message: `Letter has already been issued with Document ID ${lr.GeneratedDocumentID}`,
      };
    }

    // Merge template fields
    let renderedContent = data.customContent || lr.TemplateContent || '';
    const mergeMap: Record<string, string> = {
      '{{EmployeeName}}': `${lr.FirstName} ${lr.LastName}`.trim(),
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

    // Generate valid readable corporate PDF
    const entityName =
      lr.RegionCode === 'saudi'
        ? 'EICS Saudi Arabia Commercial Services LLC'
        : 'EICS UAE LLC';
    const regionName =
      lr.RegionCode === 'saudi'
        ? 'Kingdom of Saudi Arabia'
        : 'United Arab Emirates';

    const pdfBuffer = await generateLetterPdf({
      requestCode: lr.RequestCode,
      letterType: lr.LetterType,
      employeeName: `${lr.FirstName} ${lr.LastName}`.trim(),
      empId: lr.EmpID,
      designation: lr.Designation || 'Officer',
      joiningDate: lr.JoiningDate ? String(lr.JoiningDate) : 'N/A',
      salary: lr.Salary
        ? `${lr.RegionCode === 'saudi' ? 'SAR' : 'AED'} ${Number(lr.Salary).toLocaleString()}`
        : 'Confidential',
      entity: entityName,
      region: regionName,
      content: renderedContent,
      issuedBy: user.name || 'Human Resources Department',
      issueDate: new Date(),
    });

    // Save as genuine PDF document and register in DocumentMaster
    const cleanFirstName = (lr.FirstName || '').replace(/[^a-zA-Z0-9]/g, '_');
    const cleanLastName = (lr.LastName || '').replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${lr.LetterType.replace(/[^a-zA-Z0-9]/g, '_')}_${cleanFirstName}_${cleanLastName}.pdf`;

    const doc = await this.documentService.create({
      category: 'Letter',
      sourceModule: 'Letters',
      sourceId: String(requestId),
      empId: lr.EmpID,
      regionCode: lr.RegionCode,
      fileName,
      fileContentBase64: pdfBuffer.toString('base64'),
      mimeType: 'application/pdf',
      user,
    });

    // Mark letter issued
    await this.databaseService.query(
      `
        UPDATE dbo.LetterRequest
        SET
          Status = 'ISSUED',
          GeneratedDocumentID = @docId,
          ReviewerEmpID = @reviewerId,
          SignerEmpID = @signerId,
          UpdatedAt = SYSDATETIME()
        WHERE LetterRequestID = @id;
      `,
      {
        id: requestId,
        docId: doc.DocumentID,
        reviewerId: user.empId,
        signerId: user.empId,
      },
    );

    // Close work queue task
    await this.databaseService.query(
      `
        UPDATE dbo.WorkQueueTask
        SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
        WHERE SourceModule = 'Letter' AND SourceID = @sourceId AND Status IN ('OPEN', 'IN_PROGRESS');
      `,
      { sourceId: String(requestId), empId: user.empId },
    );

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'ISSUE_LETTER',
      module: 'Letters',
      recordId: String(requestId),
      afterValue: JSON.stringify({
        documentId: doc.DocumentID,
        fileName,
        letterType: lr.LetterType,
        format: 'PDF',
        fileSize: pdfBuffer.length,
      }),
      empId: lr.EmpID,
      regionCode: lr.RegionCode,
      source: 'Letter Service',
    });

    return {
      success: true,
      status: 'ISSUED',
      documentId: doc.DocumentID,
      fileName,
      mimeType: 'application/pdf',
      fileSize: pdfBuffer.length,
      content: renderedContent,
    };
  }
}
