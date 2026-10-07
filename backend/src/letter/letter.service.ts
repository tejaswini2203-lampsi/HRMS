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
import { SignatureService } from '../signature/signature.service';
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
  Purpose: string | null;
  Addressee: string | null;
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
  RequiresHODApproval?: boolean;
}

@Injectable()
export class LetterService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly slaService: SlaService,
    private readonly documentService: DocumentService,
    private readonly signatureService: SignatureService,
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
        t.TemplateName,
        ISNULL(t.RequiresHODApproval, 0) AS RequiresHODApproval
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
    } else if (user.role === 'HR' && user.subsidiaryId) {
      query += ` AND (lr.RegionCode = @userSub OR lr.RegionCode = @userSubAlt)`;
      params.userSub = user.subsidiaryId;
      params.userSubAlt =
        user.subsidiaryId === 'saudi' ? 'KSA' : user.subsidiaryId === 'uae' ? 'UAE' : user.subsidiaryId;
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
          e.ReportsToEmpID,
          e.IqamaNumber,
          e.EmiratesID,
          e.VisaNumber,
          e.ContractExpiry,
          d.DepartmentName,
          t.TemplateName,
          t.Content AS TemplateContent,
          ISNULL(t.RequiresHODApproval, 0) AS RequiresHODApproval
        FROM dbo.LetterRequest lr
        INNER JOIN dbo.Employee e ON lr.EmpID = e.EmpID
        LEFT JOIN dbo.Department d ON e.DepartmentID = d.DepartmentID
        LEFT JOIN dbo.LetterTemplateMaster t ON lr.TemplateID = t.TemplateID
        WHERE lr.LetterRequestID = @id;
      `,
      { id },
    );
    if (!lr) throw new NotFoundException('Letter request not found');

    if (user.role === 'EMPLOYEE' && lr.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied: You can only view your own letter requests');
    }
    if (user.role === 'HOD' && lr.ReportsToEmpID !== user.empId && lr.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied: Employee is outside your reporting scope');
    }

    return lr;
  }

  async createLetterRequest(
    data: {
      letterType: string;
      purpose: string;
      addressee?: string;
      remarks?: string;
    },
    user: AuthUser,
  ): Promise<LetterRequestRecord> {
    if (!data.purpose || !data.purpose.trim()) {
      throw new BadRequestException('Purpose is required for official letter requests');
    }

    const template = await this.databaseService.queryOne<any>(
      `SELECT * FROM dbo.LetterTemplateMaster WHERE LetterType = @type AND IsActive = 1;`,
      { type: data.letterType },
    );
    if (!template) {
      throw new BadRequestException(`No active letter template found for type "${data.letterType}"`);
    }

    const emp = await this.databaseService.queryOne<any>(
      `SELECT EmpID, FirstName, LastName, SubsidiaryID, ReportsToEmpID FROM dbo.Employee WHERE EmpID = @empId;`,
      { empId: user.empId },
    );
    if (!emp) throw new NotFoundException('Employee not found');

    const regionCode = emp.SubsidiaryID || 'uae';
    const countRes = await this.databaseService.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM dbo.LetterRequest;`,
    );
    const requestCode = `LTR-${(countRes?.count ?? 0) + 101}`;

    const requiresHod = Boolean(template.RequiresHODApproval);
    const initialStatus = requiresHod ? 'PENDING_HOD' : 'PENDING_HR';

    const created = await this.databaseService.queryOne<LetterRequestRecord>(
      `
        INSERT INTO dbo.LetterRequest (
          RequestCode,
          LetterType,
          TemplateID,
          EmpID,
          RegionCode,
          Purpose,
          Addressee,
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
          @purpose,
          @addressee,
          @status,
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
        purpose: data.purpose.trim(),
        addressee: data.addressee?.trim() || null,
        status: initialStatus,
        requestedBy: user.empId,
        remarks: data.remarks || null,
      },
    );

    if (!created) throw new BadRequestException('Failed to create letter request');

    // Create Work Queue Task according to HOD approval requirement
    const dueDate = this.slaService.calculateDueDate(new Date(), 2, 'BUSINESS').toISOString().slice(0, 10);
    const assignedRole = requiresHod ? 'HOD' : 'HR';
    const assignedEmpId = requiresHod ? emp.ReportsToEmpID || null : null;
    const actionKey = requiresHod ? 'HOD_APPROVAL' : 'HR_REVIEW';
    const title = `${user.name} — ${data.letterType}${requiresHod ? ' (HOD Endorsement)' : ''}`;
    const instruction = requiresHod
      ? `Review and endorse ${data.letterType} request for ${user.name}. Purpose: ${data.purpose.trim()}.`
      : `Review, digitally sign, and issue ${data.letterType} for ${user.name}. Purpose: ${data.purpose.trim()}.`;

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
          'Letter',
          @sourceId,
          @actionKey,
          @targetEmpId,
          @regionCode,
          @assignedRole,
          @assignedEmpId,
          @title,
          @instruction,
          @actionLabel,
          'MEDIUM',
          @dueDate,
          'ON_TIME',
          'OPEN'
        );
      `,
      {
        sourceId: String(created.LetterRequestID),
        actionKey,
        targetEmpId: user.empId,
        regionCode,
        assignedRole,
        assignedEmpId,
        title,
        instruction,
        actionLabel: requiresHod ? 'Endorse Letter' : 'Review Letter',
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
      afterValue: JSON.stringify({
        letterType: data.letterType,
        purpose: data.purpose.trim(),
        addressee: data.addressee?.trim() || null,
        requiresHODApproval: requiresHod,
        initialStatus,
      }),
      empId: user.empId,
      regionCode,
      source: 'Letter Service',
    });

    return created;
  }

  // HOD Endorsement step for letter types configured with RequiresHODApproval = true
  async processHodApproval(
    requestId: number,
    data: {
      action: 'APPROVE' | 'REJECT';
      remarks?: string;
    },
    user: AuthUser,
  ): Promise<any> {
    const lr = await this.findById(requestId, user);

    if (user.role === 'EMPLOYEE') {
      throw new ForbiddenException('Employees cannot endorse letter requests');
    }
    if (user.role === 'HOD' && lr.ReportsToEmpID !== user.empId && lr.EmpID !== user.empId) {
      throw new ForbiddenException('Access denied: You can only endorse requests for your team members');
    }
    if (lr.Status !== 'PENDING_HOD') {
      throw new BadRequestException(`Letter request is in status "${lr.Status}", not awaiting HOD endorsement`);
    }

    if (data.action === 'REJECT') {
      await this.databaseService.query(
        `
          UPDATE dbo.LetterRequest
          SET Status = 'REJECTED', Remarks = @remarks, UpdatedAt = SYSDATETIME()
          WHERE LetterRequestID = @id;
        `,
        { id: requestId, remarks: data.remarks || 'Rejected by HOD' },
      );

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
        action: 'REJECT_LETTER_HOD',
        module: 'Letters',
        recordId: String(requestId),
        afterValue: 'REJECTED: ' + (data.remarks || ''),
        empId: lr.EmpID,
        regionCode: lr.RegionCode,
        source: 'Work Queue',
      });

      return { success: true, status: 'REJECTED' };
    }

    // HOD Endorsed -> moves to PENDING_HR
    await this.databaseService.query(
      `
        UPDATE dbo.LetterRequest
        SET Status = 'PENDING_HR', UpdatedAt = SYSDATETIME()
        WHERE LetterRequestID = @id;
      `,
      { id: requestId },
    );

    // Complete HOD task
    await this.databaseService.query(
      `
        UPDATE dbo.WorkQueueTask
        SET Status = 'COMPLETED', CompletedByEmpID = @empId, CompletedAt = SYSDATETIME()
        WHERE SourceModule = 'Letter' AND SourceID = @sourceId AND Status IN ('OPEN', 'IN_PROGRESS');
      `,
      { sourceId: String(requestId), empId: user.empId },
    );

    // Dispatch HR Review & Issuance Task
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
          'Issue Letter',
          'MEDIUM',
          @dueDate,
          'ON_TIME',
          'OPEN'
        );
      `,
      {
        sourceId: String(requestId),
        targetEmpId: lr.EmpID,
        regionCode: lr.RegionCode,
        title: `${lr.FirstName} ${lr.LastName} — ${lr.LetterType} (Ready for HR Issuance)`,
        instruction: `Endorsed by HOD. Review and digitally sign/issue ${lr.LetterType} for ${lr.FirstName} ${lr.LastName}.`,
        dueDate,
      },
    );

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'ENDORSE_LETTER_HOD',
      module: 'Letters',
      recordId: String(requestId),
      beforeValue: 'PENDING_HOD',
      afterValue: 'PENDING_HR',
      empId: lr.EmpID,
      regionCode: lr.RegionCode,
      source: 'Work Queue',
    });

    return { success: true, status: 'PENDING_HR' };
  }

  // HR Review, Sign, and Issue Letter
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
    if (user.role === 'EMPLOYEE') {
      throw new ForbiddenException('Employees cannot issue official letters');
    }

    const lr = await this.findById(requestId, user);

    if (lr.Status === 'PENDING_HOD') {
      throw new BadRequestException('HOD endorsement is required before HR issuance for this letter type');
    }

    if (data.action === 'REJECT') {
      await this.databaseService.query(
        `
          UPDATE dbo.LetterRequest
          SET Status = 'REJECTED', Remarks = @remarks, UpdatedAt = SYSDATETIME()
          WHERE LetterRequestID = @id;
        `,
        { id: requestId, remarks: data.remarks || 'Rejected by HR' },
      );

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
        action: 'REJECT_LETTER_HR',
        module: 'Letters',
        recordId: String(requestId),
        afterValue: 'REJECTED: ' + (data.remarks || ''),
        empId: lr.EmpID,
        regionCode: lr.RegionCode,
        source: 'Letter Service',
      });

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

    // Merge template fields with Employee Master data
    let renderedContent = data.customContent || lr.TemplateContent || '';
    const mergeMap: Record<string, string> = {
      '{{EmployeeName}}': `${lr.FirstName} ${lr.LastName}`.trim(),
      '{{EmployeeID}}': String(lr.EmpID),
      '{{Designation}}': lr.Designation || 'Officer',
      '{{Department}}': lr.DepartmentName || 'General Operations',
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
      '{{Purpose}}': lr.Purpose || 'Official Record & Verification',
      '{{Addressee}}': lr.Addressee || 'To Whom It May Concern',
      '{{IqamaNumber}}': lr.IqamaNumber || 'N/A',
      '{{EmiratesID}}': lr.EmiratesID || 'N/A',
      '{{VisaNumber}}': lr.VisaNumber || 'N/A',
      '{{ContractExpiry}}': lr.ContractExpiry ? String(lr.ContractExpiry) : 'N/A',
    };

    for (const [placeholder, val] of Object.entries(mergeMap)) {
      renderedContent = renderedContent.replaceAll(placeholder, val);
    }

    // Capture E-Signature in SignatureService
    if (data.signatureData) {
      await this.signatureService.sign({
        sourceModule: 'Letters',
        sourceId: String(requestId),
        signatureData: data.signatureData,
        user,
      });
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
      purpose: lr.Purpose || undefined,
      addressee: lr.Addressee || undefined,
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

    // Link signature event to document and mark document SIGNED
    await this.databaseService.query(
      `
        UPDATE dbo.SignatureEvent
        SET DocumentID = @docId
        WHERE SourceModule = 'Letters' AND SourceID = @reqId;

        UPDATE dbo.DocumentMaster
        SET SignatureStatus = 'SIGNED'
        WHERE DocumentID = @docId;
      `,
      { docId: doc.DocumentID, reqId: String(requestId) },
    );

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
        purpose: lr.Purpose,
        addressee: lr.Addressee,
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
