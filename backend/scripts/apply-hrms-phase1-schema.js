const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function runMigration() {
  console.log('Connecting to EICS_DB...');
  const pool = await sql.connect({ connectionString: CONNECTION });
  console.log('Connected. Starting HRMS Phase 1 Migration...');

  // 1. Safe ALTER of Employee table
  console.log('1. Extending Employee table with HRMS Phase 1 fields...');
  const employeeColumns = [
    { name: 'Designation', type: 'NVARCHAR(150) NULL' },
    { name: 'JoiningDate', type: 'DATE NULL' },
    { name: 'EmploymentType', type: 'NVARCHAR(50) NULL' },
    { name: 'EntityID', type: 'INT NULL' },
    { name: 'CountryRegion', type: 'NVARCHAR(50) NULL' },
    { name: 'Salary', type: 'DECIMAL(18,2) NULL' },
    { name: 'IqamaNumber', type: 'NVARCHAR(50) NULL' },
    { name: 'IqamaExpiry', type: 'DATE NULL' },
    { name: 'EmiratesID', type: 'NVARCHAR(50) NULL' },
    { name: 'EmiratesIDExpiry', type: 'DATE NULL' },
    { name: 'VisaNumber', type: 'NVARCHAR(50) NULL' },
    { name: 'VisaExpiry', type: 'DATE NULL' },
    { name: 'Sponsor', type: 'NVARCHAR(150) NULL' },
    { name: 'KSAVendorType', type: 'NVARCHAR(100) NULL' },
    { name: 'UAEEmployeeCategory', type: 'NVARCHAR(50) NULL' },
    { name: 'UAEVisaType', type: 'NVARCHAR(50) NULL' },
  ];

  for (const col of employeeColumns) {
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Employee' AND COLUMN_NAME = '${col.name}'
      )
      BEGIN
        ALTER TABLE dbo.Employee ADD ${col.name} ${col.type};
        PRINT 'Added column ${col.name} to Employee';
      END
    `);
  }

  // 2. Master Tables
  console.log('2. Creating HRMS Master tables...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RegionMaster')
    BEGIN
      CREATE TABLE dbo.RegionMaster (
        RegionID INT IDENTITY(1,1) PRIMARY KEY,
        Code NVARCHAR(20) NOT NULL UNIQUE,
        Name NVARCHAR(100) NOT NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Active', -- 'Active', 'FutureInactive'
        Description NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EntityMaster')
    BEGIN
      CREATE TABLE dbo.EntityMaster (
        EntityID INT IDENTITY(1,1) PRIMARY KEY,
        RegionCode NVARCHAR(20) NOT NULL,
        EntityName NVARCHAR(150) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EventTypeMaster')
    BEGIN
      CREATE TABLE dbo.EventTypeMaster (
        EventTypeID INT IDENTITY(1,1) PRIMARY KEY,
        EventCode NVARCHAR(50) NOT NULL UNIQUE,
        EventName NVARCHAR(150) NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        Category NVARCHAR(50) NOT NULL,
        LeadTimeDays INT NOT NULL DEFAULT 30,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PipelineMaster')
    BEGIN
      CREATE TABLE dbo.PipelineMaster (
        PipelineID INT IDENTITY(1,1) PRIMARY KEY,
        PipelineCode NVARCHAR(50) NOT NULL UNIQUE,
        PipelineName NVARCHAR(150) NOT NULL,
        EventCode NVARCHAR(50) NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PipelineStageMaster')
    BEGIN
      CREATE TABLE dbo.PipelineStageMaster (
        StageID INT IDENTITY(1,1) PRIMARY KEY,
        PipelineCode NVARCHAR(50) NOT NULL,
        StageKey NVARCHAR(50) NOT NULL,
        StageName NVARCHAR(150) NOT NULL,
        SequenceOrder INT NOT NULL,
        ActorRole NVARCHAR(50) NOT NULL,
        DefaultSLADays INT NOT NULL DEFAULT 3,
        IsBusinessDays BIT NOT NULL DEFAULT 1,
        IsConditional BIT NOT NULL DEFAULT 0,
        BranchCondition NVARCHAR(100) NULL,
        IsActive BIT NOT NULL DEFAULT 1
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ApprovalChainMaster')
    BEGIN
      CREATE TABLE dbo.ApprovalChainMaster (
        ApprovalChainID INT IDENTITY(1,1) PRIMARY KEY,
        RequestTypeCode NVARCHAR(50) NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        SequenceOrder INT NOT NULL,
        ApproverRole NVARCHAR(50) NOT NULL,
        IsMandatory BIT NOT NULL DEFAULT 1,
        SLADays INT NOT NULL DEFAULT 2
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SLARuleMaster')
    BEGIN
      CREATE TABLE dbo.SLARuleMaster (
        SLARuleID INT IDENTITY(1,1) PRIMARY KEY,
        RuleCode NVARCHAR(50) NOT NULL UNIQUE,
        RuleName NVARCHAR(150) NOT NULL,
        EventCode NVARCHAR(50) NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        TriggerLeadDays INT NOT NULL,
        SLADays INT NOT NULL,
        DayType NVARCHAR(20) NOT NULL DEFAULT 'BUSINESS', -- 'BUSINESS', 'CALENDAR'
        ActorRole NVARCHAR(50) NOT NULL,
        VendorName NVARCHAR(100) NULL,
        EscalationDays INT NULL,
        PendingConfirmation BIT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ClosureChecklistItemMaster')
    BEGIN
      CREATE TABLE dbo.ClosureChecklistItemMaster (
        ChecklistID INT IDENTITY(1,1) PRIMARY KEY,
        PipelineCode NVARCHAR(50) NOT NULL,
        ItemKey NVARCHAR(50) NOT NULL,
        ItemLabel NVARCHAR(200) NOT NULL,
        IsRequired BIT NOT NULL DEFAULT 1,
        ApplicableCondition NVARCHAR(100) NULL -- e.g. 'Labor' or NULL for all
      );
    END;
  `);

  // 3. Generic Compliance Runtime Tables
  console.log('3. Creating Generic Compliance Runtime tables...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ComplianceCase')
    BEGIN
      CREATE TABLE dbo.ComplianceCase (
        CaseID INT IDENTITY(1,1) PRIMARY KEY,
        CaseNumber NVARCHAR(50) NOT NULL UNIQUE,
        EmpID INT NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        EntityID INT NULL,
        EventCode NVARCHAR(50) NOT NULL,
        PipelineCode NVARCHAR(50) NOT NULL,
        CurrentStageKey NVARCHAR(50) NOT NULL,
        Status NVARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'BLOCKED', 'COMPLETED', 'CANCELLED'
        Priority NVARCHAR(20) NOT NULL DEFAULT 'MEDIUM', -- 'HIGH', 'MEDIUM', 'LOW'
        TriggerDate DATE NOT NULL,
        DueDate DATE NOT NULL,
        TargetCompletionDate DATE NULL,
        AssignedRole NVARCHAR(50) NOT NULL,
        AssignedEmpID INT NULL,
        BlockReason NVARCHAR(500) NULL,
        Source NVARCHAR(100) NOT NULL DEFAULT 'EXPIRY_DETECTION',
        MetaJson NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        ClosedAt DATETIME2 NULL
      );
      CREATE INDEX IX_ComplianceCase_EmpID ON dbo.ComplianceCase(EmpID);
      CREATE INDEX IX_ComplianceCase_Status ON dbo.ComplianceCase(Status);
      CREATE INDEX IX_ComplianceCase_Region ON dbo.ComplianceCase(RegionCode);
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CaseStageHistory')
    BEGIN
      CREATE TABLE dbo.CaseStageHistory (
        HistoryID INT IDENTITY(1,1) PRIMARY KEY,
        CaseID INT NOT NULL,
        StageKey NVARCHAR(50) NOT NULL,
        StageName NVARCHAR(150) NOT NULL,
        ActorRole NVARCHAR(50) NOT NULL,
        ActorEmpID INT NULL,
        ActionTaken NVARCHAR(50) NOT NULL,
        Comments NVARCHAR(MAX) NULL,
        EnteredAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        CompletedAt DATETIME2 NULL,
        SLAStatus NVARCHAR(30) NOT NULL DEFAULT 'ON_TIME' -- 'ON_TIME', 'NEAR_BREACH', 'BREACHED'
      );
      CREATE INDEX IX_CaseStageHistory_CaseID ON dbo.CaseStageHistory(CaseID);
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CaseDependency')
    BEGIN
      CREATE TABLE dbo.CaseDependency (
        DependencyID INT IDENTITY(1,1) PRIMARY KEY,
        CaseID INT NOT NULL,
        DependencyType NVARCHAR(50) NOT NULL,
        DependencyRefId NVARCHAR(100) NULL,
        Status NVARCHAR(30) NOT NULL DEFAULT 'PENDING', -- 'SATISFIED', 'PENDING', 'BLOCKED'
        BlockReason NVARCHAR(500) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_CaseDependency_CaseID ON dbo.CaseDependency(CaseID);
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CaseChecklistProgress')
    BEGIN
      CREATE TABLE dbo.CaseChecklistProgress (
        ProgressID INT IDENTITY(1,1) PRIMARY KEY,
        CaseID INT NOT NULL,
        ChecklistID INT NULL,
        ItemKey NVARCHAR(50) NOT NULL,
        ItemLabel NVARCHAR(200) NOT NULL,
        IsCompleted BIT NOT NULL DEFAULT 0,
        CompletedByEmpID INT NULL,
        CompletedAt DATETIME2 NULL,
        DocumentID INT NULL
      );
      CREATE INDEX IX_CaseChecklistProgress_CaseID ON dbo.CaseChecklistProgress(CaseID);
    END;
  `);

  // 4. Work Queue Orchestration Table
  console.log('4. Creating WorkQueueTask table...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'WorkQueueTask')
    BEGIN
      CREATE TABLE dbo.WorkQueueTask (
        TaskID INT IDENTITY(1,1) PRIMARY KEY,
        SourceModule NVARCHAR(50) NOT NULL,
        SourceID NVARCHAR(100) NOT NULL,
        ActionKey NVARCHAR(50) NOT NULL,
        TargetEmpID INT NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        AssignedRole NVARCHAR(50) NOT NULL,
        AssignedEmpID INT NULL,
        Title NVARCHAR(255) NOT NULL,
        Instruction NVARCHAR(500) NOT NULL,
        PrimaryActionLabel NVARCHAR(50) NOT NULL,
        Priority NVARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
        DueDate DATE NOT NULL,
        SLAStatus NVARCHAR(30) NOT NULL DEFAULT 'ON_TIME',
        Status NVARCHAR(30) NOT NULL DEFAULT 'OPEN', -- 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED'
        BlockReason NVARCHAR(500) NULL,
        CompletedByEmpID INT NULL,
        CompletedAt DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_WorkQueueTask_Status ON dbo.WorkQueueTask(Status);
      CREATE INDEX IX_WorkQueueTask_AssignedRole ON dbo.WorkQueueTask(AssignedRole);
      CREATE INDEX IX_WorkQueueTask_TargetEmpID ON dbo.WorkQueueTask(TargetEmpID);
    END;
  `);

  // 5. Document Management & E-Signature
  console.log('5. Creating DocumentMaster & SignatureEvent tables...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DocumentMaster')
    BEGIN
      CREATE TABLE dbo.DocumentMaster (
        DocumentID INT IDENTITY(1,1) PRIMARY KEY,
        Category NVARCHAR(50) NOT NULL,
        SourceModule NVARCHAR(50) NOT NULL,
        SourceID NVARCHAR(100) NULL,
        EmpID INT NULL,
        RegionCode NVARCHAR(20) NULL,
        FileName NVARCHAR(255) NOT NULL,
        FilePath NVARCHAR(500) NOT NULL,
        MimeType NVARCHAR(100) NOT NULL DEFAULT 'application/pdf',
        FileSize BIGINT NOT NULL DEFAULT 0,
        Version INT NOT NULL DEFAULT 1,
        IsActiveVersion BIT NOT NULL DEFAULT 1,
        UploadedByEmpID INT NULL,
        RetentionYears INT NOT NULL DEFAULT 5,
        ArchivedAt DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_DocumentMaster_EmpID ON dbo.DocumentMaster(EmpID);
      CREATE INDEX IX_DocumentMaster_Source ON dbo.DocumentMaster(SourceModule, SourceID);
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SignatureEvent')
    BEGIN
      CREATE TABLE dbo.SignatureEvent (
        SignatureID INT IDENTITY(1,1) PRIMARY KEY,
        DocumentID INT NULL,
        SourceModule NVARCHAR(50) NOT NULL,
        SourceID NVARCHAR(100) NOT NULL,
        SignerEmpID INT NOT NULL,
        SignerName NVARCHAR(150) NOT NULL,
        SignerRole NVARCHAR(50) NOT NULL,
        SignatureData NVARCHAR(MAX) NOT NULL,
        SignedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        IpAddress NVARCHAR(50) NULL,
        VerificationHash NVARCHAR(256) NOT NULL
      );
      CREATE INDEX IX_SignatureEvent_Source ON dbo.SignatureEvent(SourceModule, SourceID);
    END;
  `);

  // 6. Audit Trail Table
  console.log('6. Creating AuditEvent table...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AuditEvent')
    BEGIN
      CREATE TABLE dbo.AuditEvent (
        AuditID INT IDENTITY(1,1) PRIMARY KEY,
        ActorEmpID INT NULL,
        ActorName NVARCHAR(150) NOT NULL,
        ActorRole NVARCHAR(50) NOT NULL,
        Timestamp DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        Action NVARCHAR(100) NOT NULL,
        Module NVARCHAR(50) NOT NULL,
        RecordID NVARCHAR(100) NOT NULL,
        BeforeValue NVARCHAR(MAX) NULL,
        AfterValue NVARCHAR(MAX) NULL,
        EmpID INT NULL,
        RegionCode NVARCHAR(20) NULL,
        Source NVARCHAR(100) NOT NULL DEFAULT 'UI',
        RetentionYears INT NOT NULL DEFAULT 2,
        ArchivedAt DATETIME2 NULL
      );
      CREATE INDEX IX_AuditEvent_Module ON dbo.AuditEvent(Module, RecordID);
      CREATE INDEX IX_AuditEvent_EmpID ON dbo.AuditEvent(EmpID);
      CREATE INDEX IX_AuditEvent_Timestamp ON dbo.AuditEvent(Timestamp);
    END;
  `);

  // 7. Performance Management Comments
  console.log('7. Creating PerformanceComment table...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PerformanceComment')
    BEGIN
      CREATE TABLE dbo.PerformanceComment (
        CommentID INT IDENTITY(1,1) PRIMARY KEY,
        EmpID INT NOT NULL,
        Comment NVARCHAR(MAX) NOT NULL,
        Sentiment NVARCHAR(20) NOT NULL DEFAULT 'Good', -- 'Good', 'Bad'
        Priority NVARCHAR(20) NOT NULL DEFAULT 'Normal', -- 'Normal', 'High'
        CreatedByEmpID INT NOT NULL,
        CreatedByName NVARCHAR(150) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_PerformanceComment_EmpID ON dbo.PerformanceComment(EmpID);
    END;
  `);

  // 8. Employee Requests & Advances
  console.log('8. Creating RequestTypeMaster & EmployeeRequest tables...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'RequestTypeMaster')
    BEGIN
      CREATE TABLE dbo.RequestTypeMaster (
        RequestTypeID INT IDENTITY(1,1) PRIMARY KEY,
        RequestCode NVARCHAR(50) NOT NULL UNIQUE,
        RequestName NVARCHAR(150) NOT NULL,
        Category NVARCHAR(50) NOT NULL,
        RegionCode NVARCHAR(20) NULL,
        RequiresHODApproval BIT NOT NULL DEFAULT 1,
        RequiresHRApproval BIT NOT NULL DEFAULT 1,
        RequiresFinanceApproval BIT NOT NULL DEFAULT 1,
        PendingConfirmation BIT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'EmployeeRequest')
    BEGIN
      CREATE TABLE dbo.EmployeeRequest (
        RequestID INT IDENTITY(1,1) PRIMARY KEY,
        RequestCode NVARCHAR(50) NOT NULL UNIQUE,
        RequestType NVARCHAR(50) NOT NULL,
        EmpID INT NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        Amount DECIMAL(18,2) NULL,
        Reason NVARCHAR(MAX) NOT NULL,
        RepaymentSchedule NVARCHAR(MAX) NULL,
        Status NVARCHAR(30) NOT NULL DEFAULT 'PENDING_HOD', -- 'PENDING_HOD', 'PENDING_HR', 'PENDING_FINANCE', 'APPROVED', 'REJECTED', 'CANCELLED'
        CurrentApproverRole NVARCHAR(50) NOT NULL DEFAULT 'HOD',
        HODApprovedBy INT NULL,
        HODApprovedAt DATETIME2 NULL,
        HODRemarks NVARCHAR(MAX) NULL,
        HRApprovedBy INT NULL,
        HRApprovedAt DATETIME2 NULL,
        HRRemarks NVARCHAR(MAX) NULL,
        FinanceApprovedBy INT NULL,
        FinanceApprovedAt DATETIME2 NULL,
        FinanceRemarks NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_EmployeeRequest_EmpID ON dbo.EmployeeRequest(EmpID);
      CREATE INDEX IX_EmployeeRequest_Status ON dbo.EmployeeRequest(Status);
    END;
  `);

  // 9. Letter Templates & Letter Requests
  console.log('9. Creating LetterTemplateMaster & LetterRequest tables...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LetterTemplateMaster')
    BEGIN
      CREATE TABLE dbo.LetterTemplateMaster (
        TemplateID INT IDENTITY(1,1) PRIMARY KEY,
        TemplateCode NVARCHAR(50) NOT NULL UNIQUE,
        TemplateName NVARCHAR(150) NOT NULL,
        LetterType NVARCHAR(50) NOT NULL,
        RegionCode NVARCHAR(20) NULL,
        Version INT NOT NULL DEFAULT 1,
        Content NVARCHAR(MAX) NOT NULL,
        MergeFields NVARCHAR(MAX) NOT NULL,
        RequiresSignatory BIT NOT NULL DEFAULT 1,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'LetterRequest')
    BEGIN
      CREATE TABLE dbo.LetterRequest (
        LetterRequestID INT IDENTITY(1,1) PRIMARY KEY,
        RequestCode NVARCHAR(50) NOT NULL UNIQUE,
        LetterType NVARCHAR(50) NOT NULL,
        TemplateID INT NULL,
        EmpID INT NOT NULL,
        RegionCode NVARCHAR(20) NOT NULL,
        Status NVARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW', -- 'PENDING_REVIEW', 'PENDING_SIGNATURE', 'SIGNED', 'ISSUED', 'REJECTED'
        GeneratedDocumentID INT NULL,
        RequestedByEmpID INT NOT NULL,
        ReviewerEmpID INT NULL,
        SignerEmpID INT NULL,
        Remarks NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
      CREATE INDEX IX_LetterRequest_EmpID ON dbo.LetterRequest(EmpID);
      CREATE INDEX IX_LetterRequest_Status ON dbo.LetterRequest(Status);
    END;
  `);

  // 10. System Configuration & Feature Flags
  console.log('10. Creating SystemConfig table...');
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SystemConfig')
    BEGIN
      CREATE TABLE dbo.SystemConfig (
        ConfigKey NVARCHAR(100) PRIMARY KEY,
        ConfigValue NVARCHAR(MAX) NOT NULL,
        Description NVARCHAR(255) NULL,
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      );
    END;
  `);

  console.log('Database tables successfully created or verified.');
  await pool.close();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
