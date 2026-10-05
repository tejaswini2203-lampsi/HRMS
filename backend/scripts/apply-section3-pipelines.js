const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  console.log('Connecting to EICS_DB to apply additive Section 3 pipeline configurations...');
  const pool = await sql.connect({ connectionString: CONNECTION });

  // 1. Add Event Types if not exists
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.EventTypeMaster WHERE EventCode = 'KSA_OPEN_CONTRACT')
    BEGIN
      INSERT INTO dbo.EventTypeMaster (EventCode, EventName, RegionCode, Category, LeadTimeDays, IsActive)
      VALUES ('KSA_OPEN_CONTRACT', 'KSA Open Contract Termination Tracking', 'saudi', 'Contract', 60, 1);
      PRINT 'Added EventType: KSA_OPEN_CONTRACT';
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.EventTypeMaster WHERE EventCode = 'OUTBOUND_VISA_RENEWAL')
    BEGIN
      INSERT INTO dbo.EventTypeMaster (EventCode, EventName, RegionCode, Category, LeadTimeDays, IsActive)
      VALUES ('OUTBOUND_VISA_RENEWAL', 'Outbound Visa Renewal Tracking (US/UK/Schengen/India)', 'uae', 'Travel', 60, 1);
      PRINT 'Added EventType: OUTBOUND_VISA_RENEWAL';
    END
  `);

  // 2. Add Pipelines if not exists
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineMaster WHERE PipelineCode = 'KSA_OPEN_CONTRACT')
    BEGIN
      INSERT INTO dbo.PipelineMaster (PipelineCode, PipelineName, EventCode, RegionCode, IsActive)
      VALUES ('KSA_OPEN_CONTRACT', 'KSA Open Contract Termination Pipeline', 'KSA_OPEN_CONTRACT', 'saudi', 1);
      PRINT 'Added Pipeline: KSA_OPEN_CONTRACT';
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineMaster WHERE PipelineCode = 'OUTBOUND_VISA_PIPE')
    BEGIN
      INSERT INTO dbo.PipelineMaster (PipelineCode, PipelineName, EventCode, RegionCode, IsActive)
      VALUES ('OUTBOUND_VISA_PIPE', 'Outbound Visa Renewal Pipeline', 'OUTBOUND_VISA_RENEWAL', 'uae', 1);
      PRINT 'Added Pipeline: OUTBOUND_VISA_PIPE';
    END
  `);

  // 3. Add Pipeline Stages for KSA_OPEN_CONTRACT
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'KSA_OPEN_CONTRACT' AND StageKey = 'SCENARIO_SELECTION')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('KSA_OPEN_CONTRACT', 'SCENARIO_SELECTION', 'Termination Scenario Selection (A/B)', 1, 'HR', 3, 1, 0, NULL);
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'KSA_OPEN_CONTRACT' AND StageKey = 'MANAGEMENT_APPROVAL')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('KSA_OPEN_CONTRACT', 'MANAGEMENT_APPROVAL', 'Management & Legal Approval', 2, 'ADMIN', 3, 1, 0, NULL);
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'KSA_OPEN_CONTRACT' AND StageKey = 'CASE_CLOSED')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('KSA_OPEN_CONTRACT', 'CASE_CLOSED', 'Case Finalized & Documented', 3, 'HR', 1, 1, 0, NULL);
    END
  `);

  // 4. Add Pipeline Stages for OUTBOUND_VISA_PIPE
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'OUTBOUND_VISA_PIPE' AND StageKey = 'EXPIRY_DETECTED')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('OUTBOUND_VISA_PIPE', 'EXPIRY_DETECTED', 'Outbound Visa Expiry Detected', 1, 'HR', 2, 1, 0, NULL);
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'OUTBOUND_VISA_PIPE' AND StageKey = 'DOCUMENTS_PREPARATION')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('OUTBOUND_VISA_PIPE', 'DOCUMENTS_PREPARATION', 'Pending Employee Documents & Photo', 2, 'EMPLOYEE', 5, 1, 0, NULL);
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'OUTBOUND_VISA_PIPE' AND StageKey = 'EMBASSY_SUBMISSION')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('OUTBOUND_VISA_PIPE', 'EMBASSY_SUBMISSION', 'Consulate / Embassy Submission', 3, 'HR', 7, 1, 0, NULL);
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'OUTBOUND_VISA_PIPE' AND StageKey = 'VISA_ISSUANCE')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('OUTBOUND_VISA_PIPE', 'VISA_ISSUANCE', 'Visa Stamped & Document Upload', 4, 'HR', 2, 1, 0, NULL);
    END

    IF NOT EXISTS (SELECT 1 FROM dbo.PipelineStageMaster WHERE PipelineCode = 'OUTBOUND_VISA_PIPE' AND StageKey = 'CASE_CLOSED')
    BEGIN
      INSERT INTO dbo.PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition)
      VALUES ('OUTBOUND_VISA_PIPE', 'CASE_CLOSED', 'Outbound Visa Renewed & Closed', 5, 'HR', 1, 1, 0, NULL);
    END
  `);

  // 5. SystemConfig entries for Section 3
  const configs = [
    { key: 'passportExpiryReminderDays', val: '210,90,30', desc: 'Passport SLA reminder thresholds in days' },
    { key: 'ksaContractRenewalLeadDays', val: '75', desc: 'KSA fixed-term contract expiry detection lead time in days' },
    { key: 'ksaContractTargetBeforeExpiry', val: '60', desc: 'Target completion benchmark in days before contract expiry' },
    { key: 'outboundVisaLeadDays', val: '60', desc: 'Outbound visa expiry reminder lead time in days' },
    {
      key: 'ksaVendorRoster',
      val: JSON.stringify([
        { id: 'DIRECT', name: 'Professional Signs Direct', processingTeam: 'Internal HR Operations', slaDays: 3, fee: 0, routing: 'INTERNAL_OPS' },
        { id: 'AJEER_OUTSOURCED', name: 'Ajeer Outsourced', processingTeam: 'Ajeer Vendor Team', slaDays: 5, fee: 350, routing: 'AJEER_PORTAL' },
        { id: 'AJEER_VENDOR_1', name: 'Ajeer Vendor 1 (Tamkeen)', processingTeam: 'Tamkeen Logistics', slaDays: 5, fee: 450, routing: 'EXTERNAL_VENDOR_1' },
        { id: 'AJEER_VENDOR_2', name: 'Ajeer Vendor 2 (Al-Bayan)', processingTeam: 'Al-Bayan Manpower', slaDays: 3, fee: 500, routing: 'EXTERNAL_VENDOR_2' },
      ]),
      desc: 'Configured KSA vendor processing roster with SLAs, fees, and routing',
    },
  ];

  for (const c of configs) {
    await pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM dbo.SystemConfig WHERE ConfigKey = '${c.key}')
      BEGIN
        INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue, Description, UpdatedAt)
        VALUES ('${c.key}', '${c.val.replace(/'/g, "''")}', '${c.desc.replace(/'/g, "''")}', SYSDATETIME());
        PRINT 'Added SystemConfig: ${c.key}';
      END
    `);
  }

  console.log('✅ Section 3 pipeline configurations applied cleanly!');
  await pool.close();
}

main().catch((err) => {
  console.error('Error applying Section 3 configs:', err);
  process.exit(1);
});
