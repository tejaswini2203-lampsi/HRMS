import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import * as crypto from 'crypto';

export interface SignatureEventRecord {
  SignatureID: number;
  DocumentID: number | null;
  SourceModule: string;
  SourceID: string;
  SignerEmpID: number;
  SignerName: string;
  SignerRole: string;
  SignatureData: string;
  SignedAt: Date;
  IpAddress: string | null;
  VerificationHash: string;
}

@Injectable()
export class SignatureService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  async sign(data: {
    documentId?: number;
    sourceModule: string;
    sourceId: string;
    signatureData: string;
    user: AuthUser;
    ipAddress?: string;
  }): Promise<SignatureEventRecord> {
    if (!data.signatureData) {
      throw new BadRequestException('Signature data is required');
    }

    const timestamp = new Date().toISOString();
    const hashPayload = `${data.user.empId}|${data.user.name}|${timestamp}|${data.sourceModule}|${data.sourceId}|${data.signatureData.slice(0, 100)}`;
    const verificationHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

    const created = await this.databaseService.queryOne<SignatureEventRecord>(
      `
        INSERT INTO dbo.SignatureEvent (
          DocumentID,
          SourceModule,
          SourceID,
          SignerEmpID,
          SignerName,
          SignerRole,
          SignatureData,
          IpAddress,
          VerificationHash
        )
        OUTPUT INSERTED.*
        VALUES (
          @documentId,
          @sourceModule,
          @sourceId,
          @signerEmpId,
          @signerName,
          @signerRole,
          @signatureData,
          @ipAddress,
          @verificationHash
        );
      `,
      {
        documentId: data.documentId || null,
        sourceModule: data.sourceModule,
        sourceId: String(data.sourceId),
        signerEmpId: data.user.empId,
        signerName: data.user.name,
        signerRole: data.user.role,
        signatureData: data.signatureData,
        ipAddress: data.ipAddress || null,
        verificationHash,
      },
    );

    if (!created) throw new BadRequestException('Failed to capture signature event');

    if (data.documentId) {
      await this.databaseService.query(
        `UPDATE dbo.DocumentMaster SET SignatureStatus = 'SIGNED' WHERE DocumentID = @documentId;`,
        { documentId: data.documentId },
      );
    }

    await this.auditService.log({
      actorEmpId: data.user.empId,
      actorName: data.user.name,
      actorRole: data.user.role,
      action: 'CAPTURE_E_SIGNATURE',
      module: data.sourceModule,
      recordId: String(data.sourceId),
      afterValue: JSON.stringify({ signer: data.user.name, verificationHash }),
      empId: data.user.empId,
      source: 'E-Sign Component',
    });

    return created;
  }

  async getSignatures(sourceModule: string, sourceId: string): Promise<SignatureEventRecord[]> {
    return this.databaseService.query<SignatureEventRecord>(
      `
        SELECT * FROM dbo.SignatureEvent
        WHERE SourceModule = @sourceModule AND SourceID = @sourceId
        ORDER BY SignatureID DESC;
      `,
      { sourceModule, sourceId: String(sourceId) },
    );
  }

  async getSignaturesByDocumentId(documentId: number): Promise<SignatureEventRecord[]> {
    return this.databaseService.query<SignatureEventRecord>(
      `
        SELECT * FROM dbo.SignatureEvent
        WHERE DocumentID = @documentId
        ORDER BY SignatureID DESC;
      `,
      { documentId },
    );
  }
}
