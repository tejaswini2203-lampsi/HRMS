import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateAuditEventDto } from './dto/create-audit-event.dto';

export interface AuditEventRecord {
  AuditID: number;
  ActorEmpID: number | null;
  ActorName: string;
  ActorRole: string;
  Timestamp: Date;
  Action: string;
  Module: string;
  RecordID: string;
  BeforeValue: string | null;
  AfterValue: string | null;
  EmpID: number | null;
  RegionCode: string | null;
  Source: string;
  RetentionYears: number;
  ArchivedAt: Date | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async log(dto: CreateAuditEventDto): Promise<void> {
    try {
      await this.databaseService.query(
        `
          INSERT INTO dbo.AuditEvent (
            ActorEmpID,
            ActorName,
            ActorRole,
            Action,
            Module,
            RecordID,
            BeforeValue,
            AfterValue,
            EmpID,
            RegionCode,
            Source
          ) VALUES (
            @actorEmpId,
            @actorName,
            @actorRole,
            @action,
            @module,
            @recordId,
            @beforeValue,
            @afterValue,
            @empId,
            @regionCode,
            @source
          );
        `,
        {
          actorEmpId: dto.actorEmpId ?? null,
          actorName: dto.actorName || 'System',
          actorRole: dto.actorRole || 'SYSTEM',
          action: dto.action,
          module: dto.module,
          recordId: String(dto.recordId),
          beforeValue: dto.beforeValue ?? null,
          afterValue: dto.afterValue ?? null,
          empId: dto.empId ?? null,
          regionCode: dto.regionCode ?? null,
          source: dto.source || 'HRMS',
        },
      );
    } catch (err) {
      this.logger.error('Failed to write audit event', err);
    }
  }

  async findAll(filters: {
    module?: string;
    recordId?: string;
    empId?: number;
    regionCode?: string;
    limit?: number;
  }): Promise<AuditEventRecord[]> {
    let query = `
      SELECT TOP (@limit)
        AuditID,
        ActorEmpID,
        ActorName,
        ActorRole,
        Timestamp,
        Action,
        Module,
        RecordID,
        BeforeValue,
        AfterValue,
        EmpID,
        RegionCode,
        Source,
        RetentionYears,
        ArchivedAt
      FROM dbo.AuditEvent
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {
      limit: filters.limit || 100,
    };

    if (filters.module) {
      query += ` AND Module = @module`;
      params.module = filters.module;
    }
    if (filters.recordId) {
      query += ` AND RecordID = @recordId`;
      params.recordId = filters.recordId;
    }
    if (filters.empId) {
      query += ` AND EmpID = @empId`;
      params.empId = filters.empId;
    }
    if (filters.regionCode && filters.regionCode !== 'all') {
      query += ` AND (RegionCode = @regionCode OR RegionCode IS NULL)`;
      params.regionCode = filters.regionCode;
    }

    query += ` ORDER BY AuditID DESC;`;

    return this.databaseService.query<AuditEventRecord>(query, params);
  }
}
