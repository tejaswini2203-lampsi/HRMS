const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function seed() {
  console.log('Connecting to EICS_DB for seeding...');
  const pool = await sql.connect({ connectionString: CONNECTION });

  // 1. RegionMaster
  console.log('Seeding RegionMaster...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM RegionMaster WHERE Code = 'uae')
      INSERT INTO RegionMaster (Code, Name, Status, Description) VALUES ('uae', 'United Arab Emirates', 'Active', 'UAE Regional Operations');
    IF NOT EXISTS (SELECT 1 FROM RegionMaster WHERE Code = 'saudi')
      INSERT INTO RegionMaster (Code, Name, Status, Description) VALUES ('saudi', 'Kingdom of Saudi Arabia', 'Active', 'KSA Regional Operations');
    IF NOT EXISTS (SELECT 1 FROM RegionMaster WHERE Code = 'india')
      INSERT INTO RegionMaster (Code, Name, Status, Description) VALUES ('india', 'India Corporate / Hub', 'FutureInactive', 'Reserved for future phase - preserved inactive');
  `);

  // 2. EntityMaster
  console.log('Seeding EntityMaster...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM EntityMaster WHERE EntityName = 'EICS UAE LLC')
      INSERT INTO EntityMaster (RegionCode, EntityName, IsActive) VALUES ('uae', 'EICS UAE LLC', 1);
    IF NOT EXISTS (SELECT 1 FROM EntityMaster WHERE EntityName = 'EICS Saudi Arabia Commercial Services LLC')
      INSERT INTO EntityMaster (RegionCode, EntityName, IsActive) VALUES ('saudi', 'EICS Saudi Arabia Commercial Services LLC', 1);
    IF NOT EXISTS (SELECT 1 FROM EntityMaster WHERE EntityName = 'EICS India Pvt Ltd')
      INSERT INTO EntityMaster (RegionCode, EntityName, IsActive) VALUES ('india', 'EICS India Pvt Ltd', 0);
  `);

  // 3. EventTypeMaster
  console.log('Seeding EventTypeMaster...');
  await pool.request().query(`
    MERGE EventTypeMaster AS target
    USING (VALUES
      ('KSA_CONTRACT_RENEWAL', 'Fixed Term Contract Renewal', 'saudi', 'Contract', 75, 1),
      ('KSA_IQAMA_RENEWAL', 'Iqama Renewal', 'saudi', 'Residency', 40, 1),
      ('KSA_EXIT_REENTRY', 'Exit/Re-Entry Visa', 'saudi', 'Travel', 10, 1),
      ('KSA_AIRFARE', 'KSA Airfare Entitlement', 'saudi', 'Benefits', 30, 1),
      ('KSA_BUSINESS_TRAVEL', 'Business Travel Outbound Visa', 'saudi', 'Travel', 30, 1),
      ('UAE_VISA_RENEWAL', 'UAE Residence Visa & Work Permit Renewal', 'uae', 'Residency', 90, 1),
      ('UAE_PASSPORT_EXPIRY', 'UAE Passport Expiry Alert', 'uae', 'Compliance', 210, 1)
    ) AS source (EventCode, EventName, RegionCode, Category, LeadTimeDays, IsActive)
    ON target.EventCode = source.EventCode
    WHEN NOT MATCHED THEN
      INSERT (EventCode, EventName, RegionCode, Category, LeadTimeDays, IsActive)
      VALUES (source.EventCode, source.EventName, source.RegionCode, source.Category, source.LeadTimeDays, source.IsActive);
  `);

  // 4. PipelineMaster
  console.log('Seeding PipelineMaster...');
  await pool.request().query(`
    MERGE PipelineMaster AS target
    USING (VALUES
      ('KSA_CONTRACT_FIXED', 'KSA Contract Renewal (Fixed Term)', 'KSA_CONTRACT_RENEWAL', 'saudi', 1),
      ('KSA_IQAMA', 'KSA Iqama Renewal Pipeline', 'KSA_IQAMA_RENEWAL', 'saudi', 1),
      ('KSA_EXIT_REENTRY_PIPE', 'KSA Exit/Re-Entry Pipeline', 'KSA_EXIT_REENTRY', 'saudi', 1),
      ('KSA_AIRFARE_PIPE', 'KSA Airfare Approval Pipeline', 'KSA_AIRFARE', 'saudi', 1),
      ('UAE_VISA_WORK_PERMIT', 'UAE Visa & Work Permit Renewal Pipeline', 'UAE_VISA_RENEWAL', 'uae', 1),
      ('UAE_PASSPORT_TRACK', 'UAE Passport Expiry Tracking', 'UAE_PASSPORT_EXPIRY', 'uae', 1)
    ) AS source (PipelineCode, PipelineName, EventCode, RegionCode, IsActive)
    ON target.PipelineCode = source.PipelineCode
    WHEN NOT MATCHED THEN
      INSERT (PipelineCode, PipelineName, EventCode, RegionCode, IsActive)
      VALUES (source.PipelineCode, source.PipelineName, source.EventCode, source.RegionCode, source.IsActive);
  `);

  // 5. PipelineStageMaster
  console.log('Seeding PipelineStageMaster...');
  await pool.request().query(`
    -- Clear and re-populate stages for clean configuration
    DELETE FROM PipelineStageMaster;

    -- UAE Visa Work Permit (13 Stages)
    INSERT INTO PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition, IsActive) VALUES
    ('UAE_VISA_WORK_PERMIT', 'EXPIRY_DETECTED', 'Expiry Detected', 1, 'HR', 2, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'PENDING_DOCS', 'Pending Employee Documents', 2, 'EMPLOYEE', 5, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'PENDING_HOD', 'Pending HOD Confirmation', 3, 'HOD', 4, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'CONTRACT_DRAFTING', 'Contract Drafting', 4, 'HR', 3, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'PENDING_SIGNATURE', 'Pending Employee Signature', 5, 'EMPLOYEE', 3, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'WPP_PAYMENT', 'WPP Insurance Payment', 6, 'HR', 2, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'TAWJEEH', 'Tawjeeh Training', 7, 'EMPLOYEE', 5, 1, 1, 'Labor', 1),
    ('UAE_VISA_WORK_PERMIT', 'WORK_PERMIT_PAYMENT', 'Work Permit Renewal Payment', 8, 'HR', 2, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'MEDICAL_APP_DRAFTING', 'Medical Application Drafting', 9, 'HR', 2, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'PENDING_MEDICAL_TEST', 'Pending Medical Test', 10, 'EMPLOYEE', 5, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'EMIRATES_ID_APP', 'Emirates ID Application', 11, 'HR', 3, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'RESIDENCE_VISA_RENEWAL', 'Residence Visa Renewal', 12, 'HR', 4, 1, 0, NULL, 1),
    ('UAE_VISA_WORK_PERMIT', 'CASE_CLOSED', 'Case Closed', 13, 'HR', 1, 1, 0, NULL, 1);

    -- KSA Contract Renewal (Fixed Term)
    INSERT INTO PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition, IsActive) VALUES
    ('KSA_CONTRACT_FIXED', 'EXPIRY_DETECTED', 'Contract Expiry Detected (75d)', 1, 'HR', 2, 1, 0, NULL, 1),
    ('KSA_CONTRACT_FIXED', 'HOD_CONFIRMATION', 'HOD Renewal Confirmation', 2, 'HOD', 4, 1, 0, NULL, 1),
    ('KSA_CONTRACT_FIXED', 'ADMIN_AJEER', 'Admin / Ajeer Processing', 3, 'ADMIN', 5, 1, 0, NULL, 1),
    ('KSA_CONTRACT_FIXED', 'CASE_CLOSED', 'Contract Renewed (Target 60d before expiry)', 4, 'HR', 1, 1, 0, NULL, 1);

    -- KSA Iqama Renewal
    INSERT INTO PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition, IsActive) VALUES
    ('KSA_IQAMA', 'EXPIRY_DETECTED', 'Iqama Expiry Detected (40d)', 1, 'HR', 2, 1, 0, NULL, 1),
    ('KSA_IQAMA', 'HOD_DURATION', 'HOD Duration Confirmation (3/6/12 Mo)', 2, 'HOD', 3, 1, 0, NULL, 1),
    ('KSA_IQAMA', 'VENDOR_ADMIN', 'Vendor / Admin Processing', 3, 'ADMIN', 3, 1, 0, NULL, 1),
    ('KSA_IQAMA', 'FINANCE_PAYMENT', 'Finance Fee Payment', 4, 'HR', 2, 1, 0, NULL, 1),
    ('KSA_IQAMA', 'CASE_CLOSED', 'Iqama Issued & Closed', 5, 'HR', 1, 1, 0, NULL, 1);

    -- KSA Exit / Re-Entry Visa Pipeline
    INSERT INTO PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition, IsActive) VALUES
    ('KSA_EXIT_REENTRY_PIPE', 'SUBMISSION', 'Request Submitted', 1, 'EMPLOYEE', 1, 1, 0, NULL, 1),
    ('KSA_EXIT_REENTRY_PIPE', 'DEPENDENCY_CHECK', 'Travel & Iqama Validity Check', 2, 'HR', 1, 1, 0, NULL, 1),
    ('KSA_EXIT_REENTRY_PIPE', 'HR_REVIEW', 'HR Review & Cost Assignment', 3, 'HR', 2, 1, 0, NULL, 1),
    ('KSA_EXIT_REENTRY_PIPE', 'FINANCE_PAYMENT', 'Finance Payment & Visa Issue', 4, 'HR', 2, 1, 0, NULL, 1),
    ('KSA_EXIT_REENTRY_PIPE', 'CASE_CLOSED', 'Visa Issued (60d validity)', 5, 'HR', 1, 1, 0, NULL, 1);

    -- KSA Airfare Pipeline
    INSERT INTO PipelineStageMaster (PipelineCode, StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition, IsActive) VALUES
    ('KSA_AIRFARE_PIPE', 'SUBMISSION', 'Airfare Request Submission', 1, 'EMPLOYEE', 1, 1, 0, NULL, 1),
    ('KSA_AIRFARE_PIPE', 'HR_APPROVAL', 'HR Review & Eligibility Verification', 2, 'HR', 2, 1, 0, NULL, 1),
    ('KSA_AIRFARE_PIPE', 'FINANCE_MGR_APPROVAL', 'Finance Manager Approval', 3, 'ADMIN', 2, 1, 0, NULL, 1),
    ('KSA_AIRFARE_PIPE', 'FINANCE_DIR_APPROVAL', 'Finance Director Approval', 4, 'ADMIN', 2, 1, 0, NULL, 1),
    ('KSA_AIRFARE_PIPE', 'FINANCE_PROCESSING', 'Ticket / Disbursement Processing', 5, 'HR', 3, 1, 0, NULL, 1),
    ('KSA_AIRFARE_PIPE', 'CASE_CLOSED', 'Airfare Completed', 6, 'HR', 1, 1, 0, NULL, 1);
  `);

  // 6. Closure Checklist for UAE Visa
  console.log('Seeding ClosureChecklistItemMaster...');
  await pool.request().query(`
    DELETE FROM ClosureChecklistItemMaster WHERE PipelineCode = 'UAE_VISA_WORK_PERMIT';
    INSERT INTO ClosureChecklistItemMaster (PipelineCode, ItemKey, ItemLabel, IsRequired, ApplicableCondition) VALUES
    ('UAE_VISA_WORK_PERMIT', 'PHOTO', 'Employee Passport Photo', 1, NULL),
    ('UAE_VISA_WORK_PERMIT', 'PASSPORT_COPY', 'Clear Passport Copy', 1, NULL),
    ('UAE_VISA_WORK_PERMIT', 'SIGNED_CONTRACT', 'Signed Employment Contract', 1, NULL),
    ('UAE_VISA_WORK_PERMIT', 'WPP_RECEIPT', 'WPP Insurance Payment Receipt', 1, NULL),
    ('UAE_VISA_WORK_PERMIT', 'TAWJEEH_CERT', 'Tawjeeh Training Certificate', 1, 'Labor'),
    ('UAE_VISA_WORK_PERMIT', 'WORK_PERMIT_RECEIPT', 'Work Permit Payment Receipt', 1, NULL),
    ('UAE_VISA_WORK_PERMIT', 'MEDICAL_RESULT', 'Medical Fitness Test Result', 1, NULL),
    ('UAE_VISA_WORK_PERMIT', 'EMIRATES_ID_APP', 'Emirates ID Application Confirmation', 1, NULL),
    ('UAE_VISA_WORK_PERMIT', 'RESIDENCE_VISA', 'Residence Visa Stamped/eVisa Copy', 1, NULL);
  `);

  // 7. SLARuleMaster
  console.log('Seeding SLARuleMaster...');
  await pool.request().query(`
    MERGE SLARuleMaster AS target
    USING (VALUES
      ('KSA_CONT_NOTIF_75', 'KSA Fixed Contract 75d Trigger', 'KSA_CONTRACT_RENEWAL', 'saudi', 75, 2, 'BUSINESS', 'HR', NULL, NULL, 0, 1),
      ('KSA_CONT_HOD_SLA', 'KSA Contract HOD Confirmation SLA', 'KSA_CONTRACT_RENEWAL', 'saudi', 75, 4, 'BUSINESS', 'HOD', NULL, NULL, 0, 1),
      ('KSA_CONT_VEND_SLA', 'KSA Contract Admin/Ajeer SLA', 'KSA_CONTRACT_RENEWAL', 'saudi', 75, 5, 'BUSINESS', 'ADMIN', 'Ajeer', NULL, 0, 1),
      ('KSA_IQAMA_NOTIF_40', 'KSA Iqama 40d Trigger', 'KSA_IQAMA_RENEWAL', 'saudi', 40, 2, 'BUSINESS', 'HR', NULL, NULL, 0, 1),
      ('KSA_IQAMA_HOD_SLA', 'KSA Iqama HOD Duration SLA', 'KSA_IQAMA_RENEWAL', 'saudi', 40, 3, 'BUSINESS', 'HOD', NULL, NULL, 0, 1),
      ('KSA_IQAMA_VEND_SLA', 'KSA Iqama Vendor SLA', 'KSA_IQAMA_RENEWAL', 'saudi', 40, 3, 'BUSINESS', 'ADMIN', 'Muqeem', NULL, 0, 1),
      ('UAE_VISA_STD_90', 'UAE Visa Standard Lead Time', 'UAE_VISA_RENEWAL', 'uae', 90, 5, 'CALENDAR', 'HR', NULL, NULL, 0, 1),
      ('UAE_VISA_EXEC_180', 'UAE Visa Manager Lead Time', 'UAE_VISA_RENEWAL', 'uae', 180, 5, 'CALENDAR', 'HR', NULL, NULL, 0, 1),
      ('UAE_PASS_ALERT_210', 'UAE Passport Expiry 210 Days Alert', 'UAE_PASSPORT_EXPIRY', 'uae', 210, 5, 'CALENDAR', 'HR', NULL, NULL, 0, 1),
      ('UAE_PASS_ALERT_90', 'UAE Passport Expiry 90 Days Alert', 'UAE_PASSPORT_EXPIRY', 'uae', 90, 3, 'CALENDAR', 'HR', NULL, NULL, 0, 1),
      ('UAE_PASS_ALERT_30', 'UAE Passport Expiry 30 Days Alert', 'UAE_PASSPORT_EXPIRY', 'uae', 30, 2, 'CALENDAR', 'HR', NULL, NULL, 0, 1),
      ('ESCALATION_DEFAULT', 'Default Escalation Structure', 'UAE_VISA_RENEWAL', 'uae', 0, 2, 'BUSINESS', 'ADMIN', NULL, 2, 1, 1)
    ) AS source (RuleCode, RuleName, EventCode, RegionCode, TriggerLeadDays, SLADays, DayType, ActorRole, VendorName, EscalationDays, PendingConfirmation, IsActive)
    ON target.RuleCode = source.RuleCode
    WHEN NOT MATCHED THEN
      INSERT (RuleCode, RuleName, EventCode, RegionCode, TriggerLeadDays, SLADays, DayType, ActorRole, VendorName, EscalationDays, PendingConfirmation, IsActive)
      VALUES (source.RuleCode, source.RuleName, source.EventCode, source.RegionCode, source.TriggerLeadDays, source.SLADays, source.DayType, source.ActorRole, source.VendorName, source.EscalationDays, source.PendingConfirmation, source.IsActive);
  `);

  // 8. RequestTypeMaster
  console.log('Seeding RequestTypeMaster...');
  await pool.request().query(`
    MERGE RequestTypeMaster AS target
    USING (VALUES
      ('SALARY_ADVANCE', 'Salary Advance Request', 'Advance', NULL, 1, 1, 1, 1, 1),
      ('GRATUITY_ADVANCE', 'Gratuity Advance Request', 'Advance', NULL, 1, 1, 1, 1, 1)
    ) AS source (RequestCode, RequestName, Category, RegionCode, RequiresHODApproval, RequiresHRApproval, RequiresFinanceApproval, PendingConfirmation, IsActive)
    ON target.RequestCode = source.RequestCode
    WHEN NOT MATCHED THEN
      INSERT (RequestCode, RequestName, Category, RegionCode, RequiresHODApproval, RequiresHRApproval, RequiresFinanceApproval, PendingConfirmation, IsActive)
      VALUES (source.RequestCode, source.RequestName, source.Category, source.RegionCode, source.RequiresHODApproval, source.RequiresHRApproval, source.RequiresFinanceApproval, source.PendingConfirmation, source.IsActive);
  `);

  // 9. LetterTemplateMaster (11 Letter Types)
  console.log('Seeding LetterTemplateMaster...');
  const letterTemplates = [
    { code: 'CAP', name: 'CAP Letter', type: 'CAP Letter' },
    { code: 'PENALTY', name: 'Penalty Letter', type: 'Penalty Letter' },
    { code: 'INCREMENT', name: 'Increment Letter', type: 'Increment Letter' },
    { code: 'PROMOTION', name: 'Promotion Letter', type: 'Promotion Letter' },
    { code: 'INTERNSHIP', name: 'Internship Certificate', type: 'Internship Certificate' },
    { code: 'EXPERIENCE', name: 'Experience Letter', type: 'Experience Letter' },
    { code: 'EOSB', name: 'EOSB Acknowledgement Letter', type: 'EOSB Acknowledgement Letter' },
    { code: 'SALARY_CHANGE', name: 'Salary Change Letter', type: 'Salary Change Letter' },
    { code: 'SALARY_CERTIFICATE', name: 'Salary Certificate', type: 'Salary Certificate' },
    { code: 'SALARY_TRANSFER', name: 'Salary Transfer Letter', type: 'Salary Transfer Letter' },
    { code: 'TERMINATION', name: 'Termination Letter', type: 'Termination Letter' },
  ];

  for (const t of letterTemplates) {
    const defaultContent = `To Whom It May Concern,\n\nThis is to certify regarding employee {{EmployeeName}} (ID: {{EmployeeID}}), currently designated as {{Designation}} at {{Entity}} ({{Region}}).\n\nJoining Date: {{JoiningDate}}\nCurrent Gross Salary: {{Salary}}\n\nThis letter is issued upon formal request.\n\nSincerely,\nHuman Resources Department\n{{Entity}}`;
    const mergeFields = JSON.stringify(['EmployeeName', 'EmployeeID', 'Designation', 'JoiningDate', 'Salary', 'Entity', 'Region']);

    await pool.request()
      .input('code', t.code)
      .input('name', t.name)
      .input('type', t.type)
      .input('content', defaultContent)
      .input('fields', mergeFields)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM LetterTemplateMaster WHERE TemplateCode = @code)
        BEGIN
          INSERT INTO LetterTemplateMaster (TemplateCode, TemplateName, LetterType, Version, Content, MergeFields, RequiresSignatory, IsActive)
          VALUES (@code, @name, @type, 1, @content, @fields, 1, 1);
        END
      `);
  }

  // 10. SystemConfig / Feature Flags
  console.log('Seeding SystemConfig...');
  await pool.request().query(`
    MERGE SystemConfig AS target
    USING (VALUES
      ('peopleStrongEnabled', 'false', 'PeopleStrong Integration Boundary Flag'),
      ('whatsAppEnabled', 'false', 'WhatsApp Notification Provider Flag'),
      ('defaultIqamaCost3Months', '650', 'KSA 3-Month Iqama Renewal Govt Fee (SAR)'),
      ('defaultIqamaCost6Months', '1200', 'KSA 6-Month Iqama Renewal Govt Fee (SAR)'),
      ('defaultIqamaCost12Months', '2000', 'KSA 12-Month Iqama Renewal Govt Fee (SAR)'),
      ('ksaExitReentryRestrictionDays', '45', 'Minimum Iqama validity days required for Exit/Re-entry approval'),
      ('ksaExitReentryValidityDays', '60', 'Standard validity days for Exit/Re-Entry Visa'),
      ('uaeVisaStandardLeadDays', '90', 'Standard UAE Visa expiry detection lead time in days'),
      ('uaeVisaExecutiveLeadDays', '180', 'Manager/Frequent Traveler UAE Visa expiry detection lead time in days')
    ) AS source (ConfigKey, ConfigValue, Description)
    ON target.ConfigKey = source.ConfigKey
    WHEN NOT MATCHED THEN
      INSERT (ConfigKey, ConfigValue, Description)
      VALUES (source.ConfigKey, source.ConfigValue, source.Description);
  `);

  // 11. Populate HRMS fields for existing demo employees (Ali Md, Rahul Kumar, Saleem, Mudasiir, etc.)
  console.log('Enriching existing employees with realistic HRMS Phase 1 data...');
  await pool.request().query(`
    -- UAE Employee: Saleem (EmpID 2)
    UPDATE Employee
    SET Designation = 'Installation Specialist',
        JoiningDate = '2023-03-15',
        EmploymentType = 'Fixed Term',
        CountryRegion = 'uae',
        Salary = 6500.00,
        EmiratesID = '784-1990-1234567-1',
        EmiratesIDExpiry = DATEADD(DAY, 45, CAST(GETDATE() AS DATE)),
        VisaNumber = 'UAE-V-882910',
        VisaExpiry = DATEADD(DAY, 45, CAST(GETDATE() AS DATE)),
        UAEEmployeeCategory = 'Labor',
        UAEVisaType = 'Employment Residence',
        Sponsor = 'EICS UAE LLC'
    WHERE EmpID = 2;

    -- UAE Employee: Shashi (HOD UAE, EmpID 23)
    UPDATE Employee
    SET Designation = 'Operations Director',
        JoiningDate = '2021-06-01',
        EmploymentType = 'Open Contract',
        CountryRegion = 'uae',
        Salary = 18500.00,
        EmiratesID = '784-1985-7654321-2',
        EmiratesIDExpiry = DATEADD(DAY, 180, CAST(GETDATE() AS DATE)),
        VisaNumber = 'UAE-V-771822',
        VisaExpiry = DATEADD(DAY, 180, CAST(GETDATE() AS DATE)),
        UAEEmployeeCategory = 'Manager',
        UAEVisaType = 'Investor/Partner',
        Sponsor = 'EICS UAE LLC'
    WHERE EmpID = 23;

    -- KSA Employee: Mudasiir (EmpID 3)
    UPDATE Employee
    SET Designation = 'Production Technician',
        JoiningDate = '2023-01-10',
        EmploymentType = 'Fixed Term',
        CountryRegion = 'saudi',
        Salary = 5500.00,
        IqamaNumber = '2489102931',
        IqamaExpiry = DATEADD(DAY, 35, CAST(GETDATE() AS DATE)),
        VisaNumber = 'KSA-V-99120',
        VisaExpiry = DATEADD(DAY, 35, CAST(GETDATE() AS DATE)),
        KSAVendorType = 'Ajeer Certified',
        Sponsor = 'EICS Saudi Arabia Commercial Services LLC'
    WHERE EmpID = 3;

    -- KSA Employee: Rahul Kumar (Admin / Employee EmpID 18)
    UPDATE Employee
    SET Designation = 'Senior Solutions Architect',
        JoiningDate = '2022-04-12',
        EmploymentType = 'Fixed Term',
        CountryRegion = 'saudi',
        Salary = 16000.00,
        IqamaNumber = '2398471923',
        IqamaExpiry = DATEADD(DAY, 25, CAST(GETDATE() AS DATE)),
        VisaNumber = 'KSA-V-33109',
        VisaExpiry = DATEADD(DAY, 25, CAST(GETDATE() AS DATE)),
        KSAVendorType = 'Direct Sponsorship',
        Sponsor = 'EICS Saudi Arabia Commercial Services LLC'
    WHERE EmpID = 18;

    -- Ensure reportsTo for Mudasiir -> Vyshnav (HOD Saudi, EmpID 24)
    UPDATE Employee SET ReportsToEmpID = 24 WHERE EmpID = 3;
    -- Ensure reportsTo for Saleem -> Sashi (HOD UAE, EmpID 23)
    UPDATE Employee SET ReportsToEmpID = 23 WHERE EmpID = 2;
  `);

  console.log('Recording baseline SYSTEM_INITIALIZATION audit event if not already present...');
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM dbo.AuditEvent 
      WHERE Action = 'SYSTEM_INITIALIZATION' AND RecordID = 'SEED_HRMS_PHASE1'
    )
    BEGIN
      INSERT INTO dbo.AuditEvent (
        ActorEmpID, ActorName, ActorRole, Action, Module, RecordID,
        BeforeValue, AfterValue, EmpID, RegionCode, Source, RetentionYears
      ) VALUES (
        NULL, 'System Seed Process', 'SYSTEM', 'SYSTEM_INITIALIZATION', 'System', 'SEED_HRMS_PHASE1',
        NULL, 'HRMS Phase 1 Master Data & Configuration pipelines initialized', NULL, 'all', 'Database Seed', 2
      );
    END;
  `);

  console.log('Seeding completed successfully!');
  await pool.close();
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
