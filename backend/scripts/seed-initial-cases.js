const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function seedCases() {
  const pool = await sql.connect({ connectionString: CONNECTION });

  // 1. Clear any old tasks/cases if re-running
  await pool.request().query(`
    DELETE FROM dbo.CaseChecklistProgress;
    DELETE FROM dbo.CaseStageHistory;
    DELETE FROM dbo.CaseDependency;
    DELETE FROM dbo.WorkQueueTask;
    DELETE FROM dbo.ComplianceCase;
  `);

  console.log('Seeding Demo Flow 1: KSA Iqama Renewal for Rahul Kumar & Mudasiir...');
  // Rahul Kumar (EmpID 18) - Iqama expires in 25 days (lead time 40 days)
  await pool.request().query(`
    INSERT INTO dbo.ComplianceCase (
      CaseNumber, EmpID, RegionCode, EntityID, EventCode, PipelineCode, CurrentStageKey,
      Status, Priority, TriggerDate, DueDate, TargetCompletionDate, AssignedRole, BlockReason, Source
    ) VALUES (
      'CASE-KSA-0001', 18, 'saudi', 2, 'KSA_IQAMA_RENEWAL', 'KSA_IQAMA', 'EXPIRY_DETECTED',
      'OPEN', 'HIGH', CAST(GETDATE() AS DATE), DATEADD(day, 3, CAST(GETDATE() AS DATE)), DATEADD(day, 25, CAST(GETDATE() AS DATE)), 'HR', NULL, 'Expiry Engine'
    );

    INSERT INTO dbo.WorkQueueTask (
      SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, AssignedEmpID,
      Title, Instruction, PrimaryActionLabel, Priority, DueDate, SLAStatus, Status
    ) VALUES (
      'Compliance', '1', 'EXPIRY_DETECTED', 18, 'saudi', 'HR', NULL,
      'Rahul Kumar — Iqama Expiry Detected',
      'Iqama expires in 25 days. Initiate renewal workflow and verify sponsorship details.',
      'Start Renewal', 'HIGH', DATEADD(day, 2, CAST(GETDATE() AS DATE)), 'NEAR_BREACH', 'OPEN'
    );

    INSERT INTO dbo.CaseStageHistory (
      CaseID, StageKey, StageName, ActorRole, ActorEmpID, ActionTaken, Comments, EnteredAt, SLAStatus
    ) VALUES (
      1, 'EXPIRY_DETECTED', 'Iqama Expiry Detected (40d)', 'SYSTEM', NULL, 'EXPIRY_DETECTED', 'Detected expiry 25 days out', SYSDATETIME(), 'NEAR_BREACH'
    );
  `);

  // Mudasiir (EmpID 3) - Fixed Term Contract Renewal (expires in 35 days, lead time 75 days)
  await pool.request().query(`
    INSERT INTO dbo.ComplianceCase (
      CaseNumber, EmpID, RegionCode, EntityID, EventCode, PipelineCode, CurrentStageKey,
      Status, Priority, TriggerDate, DueDate, TargetCompletionDate, AssignedRole, BlockReason, Source
    ) VALUES (
      'CASE-KSA-0002', 3, 'saudi', 2, 'KSA_CONTRACT_RENEWAL', 'KSA_CONTRACT_FIXED', 'HOD_CONFIRMATION',
      'PENDING_APPROVAL', 'HIGH', DATEADD(day, -5, CAST(GETDATE() AS DATE)), DATEADD(day, 2, CAST(GETDATE() AS DATE)), DATEADD(day, 35, CAST(GETDATE() AS DATE)), 'HOD', NULL, 'Expiry Engine'
    );

    -- HOD Task for Vyshnav (HOD Saudi, EmpID 24)
    INSERT INTO dbo.WorkQueueTask (
      SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, AssignedEmpID,
      Title, Instruction, PrimaryActionLabel, Priority, DueDate, SLAStatus, Status
    ) VALUES (
      'Compliance', '2', 'HOD_CONFIRMATION', 3, 'saudi', 'HOD', 24,
      'Mudasiir — Contract Renewal Confirmation',
      'Confirm fixed-term contract renewal terms for team member Mudasiir (4 business days SLA).',
      'Confirm Renewal', 'HIGH', DATEADD(day, 2, CAST(GETDATE() AS DATE)), 'ON_TIME', 'OPEN'
    );

    INSERT INTO dbo.CaseStageHistory (
      CaseID, StageKey, StageName, ActorRole, ActorEmpID, ActionTaken, Comments, EnteredAt, SLAStatus
    ) VALUES (
      2, 'HOD_CONFIRMATION', 'HOD Renewal Confirmation', 'HOD', 24, 'STAGE_ENTERED', 'Pending HOD evaluation', SYSDATETIME(), 'ON_TIME'
    );
  `);

  console.log('Seeding Demo Flow 2: UAE Visa & Work Permit for Saleem (EmpID 2, Category Labor)...');
  await pool.request().query(`
    INSERT INTO dbo.ComplianceCase (
      CaseNumber, EmpID, RegionCode, EntityID, EventCode, PipelineCode, CurrentStageKey,
      Status, Priority, TriggerDate, DueDate, TargetCompletionDate, AssignedRole, BlockReason, Source
    ) VALUES (
      'CASE-UAE-0001', 2, 'uae', 1, 'UAE_VISA_RENEWAL', 'UAE_VISA_WORK_PERMIT', 'EXPIRY_DETECTED',
      'OPEN', 'HIGH', CAST(GETDATE() AS DATE), DATEADD(day, 3, CAST(GETDATE() AS DATE)), DATEADD(day, 45, CAST(GETDATE() AS DATE)), 'HR', NULL, 'Expiry Engine'
    );

    INSERT INTO dbo.WorkQueueTask (
      SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, AssignedEmpID,
      Title, Instruction, PrimaryActionLabel, Priority, DueDate, SLAStatus, Status
    ) VALUES (
      'Compliance', '3', 'EXPIRY_DETECTED', 2, 'uae', 'HR', NULL,
      'Saleem — Residence Visa & Work Permit Expiry',
      'Employment visa expires in 45 days (Category: Labor - Tawjeeh required). Start renewal.',
      'Start Renewal', 'HIGH', DATEADD(day, 3, CAST(GETDATE() AS DATE)), 'ON_TIME', 'OPEN'
    );

    INSERT INTO dbo.CaseStageHistory (
      CaseID, StageKey, StageName, ActorRole, ActorEmpID, ActionTaken, Comments, EnteredAt, SLAStatus
    ) VALUES (
      3, 'EXPIRY_DETECTED', 'Expiry Detected', 'SYSTEM', NULL, 'EXPIRY_DETECTED', 'Expiry detected at 45 days remaining', SYSDATETIME(), 'ON_TIME'
    );

    -- Seed Closure Checklist for UAE Case 3
    INSERT INTO dbo.CaseChecklistProgress (CaseID, ChecklistID, ItemKey, ItemLabel, IsCompleted) VALUES
    (3, 1, 'PHOTO', 'Employee Passport Photo', 1),
    (3, 2, 'PASSPORT_COPY', 'Clear Passport Copy', 1),
    (3, 3, 'SIGNED_CONTRACT', 'Signed Employment Contract', 0),
    (3, 4, 'WPP_RECEIPT', 'WPP Insurance Payment Receipt', 0),
    (3, 5, 'TAWJEEH_CERT', 'Tawjeeh Training Certificate', 0),
    (3, 6, 'WORK_PERMIT_RECEIPT', 'Work Permit Payment Receipt', 0),
    (3, 7, 'MEDICAL_RESULT', 'Medical Fitness Test Result', 0),
    (3, 8, 'EMIRATES_ID_APP', 'Emirates ID Application Confirmation', 0),
    (3, 9, 'RESIDENCE_VISA', 'Residence Visa Stamped/eVisa Copy', 0);
  `);

  console.log('Seeding Demo Flow 5: Sample Advance Request for Employee...');
  await pool.request().query(`
    INSERT INTO dbo.EmployeeRequest (
      RequestCode, RequestType, EmpID, RegionCode, Amount, Reason, RepaymentSchedule, Status, CurrentApproverRole
    ) VALUES (
      'REQ-101', 'SALARY_ADVANCE', 2, 'uae', 3000.00, 'Emergency family medical expenses',
      '{"months":3,"installmentAmount":1000.00,"note":"Stored repayment schedule for future Payroll (Phase 1)"}',
      'PENDING_HOD', 'HOD'
    );

    -- HOD Task for Sashi (EmpID 23)
    INSERT INTO dbo.WorkQueueTask (
      SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, AssignedEmpID,
      Title, Instruction, PrimaryActionLabel, Priority, DueDate, SLAStatus, Status
    ) VALUES (
      'Request', '1', 'HOD_APPROVAL', 2, 'uae', 'HOD', 23,
      'Saleem — Salary Advance Request (AED 3,000)',
      'Review and confirm Salary Advance request of AED 3,000 for Saleem.',
      'Review Request', 'MEDIUM', DATEADD(day, 2, CAST(GETDATE() AS DATE)), 'ON_TIME', 'OPEN'
    );
  `);

  console.log('Seeding Demo Flow 4: Sample Letter Request...');
  await pool.request().query(`
    INSERT INTO dbo.LetterRequest (
      RequestCode, LetterType, TemplateID, EmpID, RegionCode, Status, RequestedByEmpID, Remarks
    ) VALUES (
      'LTR-101', 'Experience Letter', 6, 2, 'uae', 'PENDING_REVIEW', 2, 'Required for banking / verification purposes'
    );

    INSERT INTO dbo.WorkQueueTask (
      SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, AssignedEmpID,
      Title, Instruction, PrimaryActionLabel, Priority, DueDate, SLAStatus, Status
    ) VALUES (
      'Letter', '1', 'HR_REVIEW', 2, 'uae', 'HR', NULL,
      'Saleem — Experience Letter',
      'Review, generate, and sign Experience Letter for Saleem.',
      'Review Letter', 'MEDIUM', DATEADD(day, 3, CAST(GETDATE() AS DATE)), 'ON_TIME', 'OPEN'
    );
  `);

  console.log('Seeding Demo Flow 6: Performance Comment for Saleem...');
  await pool.request().query(`
    INSERT INTO dbo.PerformanceComment (
      EmpID, Comment, Sentiment, Priority, CreatedByEmpID, CreatedByName, CreatedAt
    ) VALUES (
      2, 'Demonstrated exceptional quality and speed during the Dubai installation project on-site.',
      'Good', 'High', 23, 'Sashi', DATEADD(day, -2, SYSDATETIME())
    );
  `);

  console.log('Recording baseline SYSTEM_INITIALIZATION audit event if not already present...');
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM dbo.AuditEvent 
      WHERE Action = 'SYSTEM_INITIALIZATION' AND RecordID = 'SEED_INITIAL_CASES'
    )
    BEGIN
      INSERT INTO dbo.AuditEvent (
        ActorEmpID, ActorName, ActorRole, Action, Module, RecordID,
        BeforeValue, AfterValue, EmpID, RegionCode, Source, RetentionYears
      ) VALUES (
        NULL, 'System Seed Process', 'SYSTEM', 'SYSTEM_INITIALIZATION', 'System', 'SEED_INITIAL_CASES',
        NULL, 'HRMS Phase 1 initial baseline workflows and compliance cases initialized', NULL, 'all', 'Database Seed', 2
      );
    END;
  `);

  console.log('All sample cases and work queue items successfully seeded!');
  await pool.close();
}

seedCases().catch(err => {
  console.error(err);
  process.exit(1);
});
