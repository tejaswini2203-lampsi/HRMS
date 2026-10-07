import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';

@Injectable()
export class MasterService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
  ) {}

  // 1. Regions
  async getRegions() {
    return this.databaseService.query(`
      SELECT RegionID, Code, Name, Status, Description, CreatedAt
      FROM dbo.RegionMaster
      ORDER BY RegionID ASC;
    `);
  }

  // 2. Entities
  async getEntities(regionCode?: string) {
    let query = `SELECT EntityID, RegionCode, EntityName, IsActive, CreatedAt FROM dbo.EntityMaster WHERE 1=1`;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY EntityID ASC;`;
    return this.databaseService.query(query, params);
  }

  // 3. Event Types
  async getEventTypes(regionCode?: string) {
    let query = `SELECT EventTypeID, EventCode, EventName, RegionCode, Category, LeadTimeDays, IsActive, CreatedAt FROM dbo.EventTypeMaster WHERE 1=1`;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY EventTypeID ASC;`;
    return this.databaseService.query(query, params);
  }

  // 4. Pipelines & Stages
  async getPipelines(regionCode?: string) {
    let query = `SELECT PipelineID, PipelineCode, PipelineName, EventCode, RegionCode, IsActive, CreatedAt FROM dbo.PipelineMaster WHERE 1=1`;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND RegionCode = @regionCode`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY PipelineID ASC;`;
    return this.databaseService.query(query, params);
  }

  async getPipelineStages(pipelineCode?: string) {
    let query = `
      SELECT StageID, PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition, IsActive
      FROM dbo.PipelineStageMaster
      WHERE 1=1
    `;
    const params: Record<string, unknown> = {};
    if (pipelineCode) {
      query += ` AND PipelineCode = @pipelineCode`;
      params.pipelineCode = pipelineCode;
    }
    query += ` ORDER BY PipelineCode, SequenceOrder ASC;`;
    return this.databaseService.query(query, params);
  }

  // 5. Closure Checklist Items
  async getClosureChecklistItems(pipelineCode?: string) {
    let query = `SELECT ChecklistID, PipelineCode, ItemKey, ItemLabel, IsRequired, ApplicableCondition FROM dbo.ClosureChecklistItemMaster WHERE 1=1`;
    const params: Record<string, unknown> = {};
    if (pipelineCode) {
      query += ` AND PipelineCode = @pipelineCode`;
      params.pipelineCode = pipelineCode;
    }
    query += ` ORDER BY ChecklistID ASC;`;
    return this.databaseService.query(query, params);
  }

  // 6. Approval Chains
  async getApprovalChains(requestTypeCode?: string, regionCode?: string) {
    let query = `SELECT ApprovalChainID, RequestTypeCode, RegionCode, SequenceOrder, ApproverRole, IsMandatory, SLADays FROM dbo.ApprovalChainMaster WHERE 1=1`;
    const params: Record<string, unknown> = {};
    if (requestTypeCode) {
      query += ` AND RequestTypeCode = @requestTypeCode`;
      params.requestTypeCode = requestTypeCode;
    }
    if (regionCode && regionCode !== 'all') {
      query += ` AND (RegionCode = @regionCode OR RegionCode IS NULL)`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY RequestTypeCode, SequenceOrder ASC;`;
    return this.databaseService.query(query, params);
  }

  // 7. Request Types
  async getRequestTypes() {
    return this.databaseService.query(`
      SELECT RequestTypeID, RequestCode, RequestName, Category, RegionCode, RequiresHODApproval, RequiresHRApproval, RequiresFinanceApproval, PendingConfirmation, IsActive
      FROM dbo.RequestTypeMaster
      WHERE IsActive = 1
      ORDER BY RequestTypeID ASC;
    `);
  }

  // 8. Letter Templates
  async getLetterTemplates(regionCode?: string) {
    let query = `
      SELECT
        TemplateID,
        TemplateCode,
        TemplateName,
        LetterType,
        RegionCode,
        Version,
        Content,
        MergeFields,
        RequiresSignatory,
        ISNULL(RequiresHODApproval, 0) AS RequiresHODApproval,
        ISNULL(Language, 'EN') AS Language,
        IsActive,
        CreatedAt,
        UpdatedAt
      FROM dbo.LetterTemplateMaster
      WHERE IsActive = 1
    `;
    const params: Record<string, unknown> = {};
    if (regionCode && regionCode !== 'all') {
      query += ` AND (RegionCode = @regionCode OR RegionCode IS NULL)`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY TemplateID ASC;`;
    return this.databaseService.query(query, params);
  }

  // 9. Advance Eligibility Rules
  async getAdvanceEligibility(requestTypeCode?: string, regionCode?: string) {
    let query = `SELECT * FROM dbo.AdvanceEligibilityRule WHERE IsActive = 1`;
    const params: Record<string, unknown> = {};
    if (requestTypeCode) {
      query += ` AND RequestTypeCode = @requestTypeCode`;
      params.requestTypeCode = requestTypeCode;
    }
    if (regionCode && regionCode !== 'all') {
      query += ` AND (RegionCode = @regionCode OR RegionCode = 'ALL')`;
      params.regionCode = regionCode;
    }
    query += ` ORDER BY RuleID ASC;`;
    return this.databaseService.query(query, params);
  }

  async updateLetterTemplate(
    id: number,
    dto: { content?: string; requiresHodApproval?: boolean; language?: string } | string,
    user: AuthUser,
  ) {
    const existing = await this.databaseService.queryOne<any>(
      `SELECT * FROM dbo.LetterTemplateMaster WHERE TemplateID = @id;`,
      { id },
    );
    if (!existing) throw new NotFoundException('Letter template not found');

    const contentVal =
      typeof dto === 'string'
        ? dto
        : dto.content !== undefined
        ? dto.content
        : (dto as any).templateBody;
    const newContent = contentVal !== undefined ? contentVal : existing.Content;
    const hodVal =
      typeof dto === 'object'
        ? dto.requiresHodApproval !== undefined
          ? dto.requiresHodApproval
          : (dto as any).requiresHODApproval
        : undefined;
    const newRequiresHod =
      hodVal !== undefined ? (hodVal ? 1 : 0) : existing.RequiresHODApproval;
    const newLanguage = (typeof dto === 'object' && dto.language) || existing.Language || 'EN';
    const newVersion = (existing.Version || 1) + 1;

    // Deactivate previous version to protect historical issued letters
    await this.databaseService.query(
      `UPDATE dbo.LetterTemplateMaster SET IsActive = 0, UpdatedAt = SYSDATETIME() WHERE TemplateID = @id;`,
      { id },
    );

    // Insert new version
    const created = await this.databaseService.queryOne<any>(
      `
        INSERT INTO dbo.LetterTemplateMaster (
          TemplateCode,
          TemplateName,
          LetterType,
          RegionCode,
          Version,
          Content,
          MergeFields,
          RequiresSignatory,
          RequiresHODApproval,
          Language,
          IsActive
        )
        OUTPUT INSERTED.*
        VALUES (
          @code,
          @name,
          @type,
          @region,
          @version,
          @content,
          @fields,
          @signatory,
          @hodApproval,
          @language,
          1
        );
      `,
      {
        code: `${(existing.TemplateCode || 'TPL').replace(/_v\d+$/, '')}_v${newVersion}`,
        name: existing.TemplateName,
        type: existing.LetterType,
        region: existing.RegionCode,
        version: newVersion,
        content: newContent,
        fields: existing.MergeFields,
        signatory: existing.RequiresSignatory,
        hodApproval: newRequiresHod,
        language: newLanguage,
      },
    );

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'VERSION_LETTER_TEMPLATE',
      module: 'Administration',
      recordId: String(created.TemplateID),
      beforeValue: JSON.stringify({ TemplateID: id, Version: existing.Version }),
      afterValue: JSON.stringify({
        TemplateID: created.TemplateID,
        Version: newVersion,
        RequiresHODApproval: newRequiresHod,
      }),
      regionCode: existing.RegionCode,
      source: 'Master Service',
    });

    return created;
  }

  // 9. System Configurations / Feature Flags
  async getSystemConfigs() {
    return this.databaseService.query(`
      SELECT ConfigKey, ConfigValue, Description, UpdatedAt
      FROM dbo.SystemConfig
      ORDER BY ConfigKey ASC;
    `);
  }

  async updateSystemConfig(key: string, value: string, user: AuthUser) {
    const existing = await this.databaseService.queryOne<any>(
      `SELECT * FROM dbo.SystemConfig WHERE ConfigKey = @key;`,
      { key },
    );

    await this.databaseService.query(
      `
        UPDATE dbo.SystemConfig
        SET ConfigValue = @value, UpdatedAt = SYSDATETIME()
        WHERE ConfigKey = @key;
      `,
      { key, value },
    );

    await this.auditService.log({
      actorEmpId: user.empId,
      actorName: user.name,
      actorRole: user.role,
      action: 'UPDATE_SYSTEM_CONFIG',
      module: 'Administration',
      recordId: key,
      beforeValue: existing ? existing.ConfigValue : null,
      afterValue: value,
      source: 'Admin UI',
    });

    return { success: true, key, value };
  }

  // 10. Document Types Catalog
  async getDocumentTypes() {
    return this.databaseService.query(`
      SELECT TypeCode, TypeName, Category, DefaultSourceModule, RequiresSignature, IsActive
      FROM dbo.DocumentTypeMaster
      WHERE IsActive = 1
      ORDER BY TypeName ASC;
    `);
  }
}
