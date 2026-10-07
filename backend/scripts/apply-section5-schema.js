const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function applySection5Schema() {
  const pool = await sql.connect({ connectionString });
  console.log('Connected to SQL Server. Applying safe Section 5 schema extensions...');

  // 1. dbo.AdvanceEligibilityRule
  const tables = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'AdvanceEligibilityRule'
  `);
  if (tables.recordset.length === 0) {
    console.log('Creating dbo.AdvanceEligibilityRule...');
    await pool.request().query(`
      CREATE TABLE dbo.AdvanceEligibilityRule (
        RuleID int IDENTITY(1,1) PRIMARY KEY,
        RequestTypeCode nvarchar(50) NOT NULL,
        RegionCode nvarchar(20) NOT NULL,
        MaxSalaryPercentage decimal(5,2) NULL,
        MinTenureMonths int NULL,
        PendingConfirmation bit NOT NULL DEFAULT 1,
        IsActive bit NOT NULL DEFAULT 1,
        CreatedAt datetime2 NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt datetime2 NOT NULL DEFAULT SYSDATETIME()
      );
    `);
    console.log('✔ dbo.AdvanceEligibilityRule created');
  } else {
    console.log('✔ dbo.AdvanceEligibilityRule already exists');
  }

  // Seed AdvanceEligibilityRule if empty
  const rulesCount = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.AdvanceEligibilityRule');
  if (rulesCount.recordset[0].cnt === 0) {
    console.log('Seeding pending confirmation rules for AdvanceEligibilityRule...');
    await pool.request().query(`
      INSERT INTO dbo.AdvanceEligibilityRule (RequestTypeCode, RegionCode, MaxSalaryPercentage, MinTenureMonths, PendingConfirmation, IsActive)
      VALUES 
        ('SALARY_ADVANCE', 'uae', NULL, NULL, 1, 1),
        ('SALARY_ADVANCE', 'saudi', NULL, NULL, 1, 1),
        ('GRATUITY_ADVANCE', 'uae', NULL, NULL, 1, 1),
        ('GRATUITY_ADVANCE', 'saudi', NULL, NULL, 1, 1);
    `);
    console.log('✔ Seeded 4 pending confirmation eligibility records');
  }

  // 2. Populate dbo.ApprovalChainMaster if empty
  const chainCount = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.ApprovalChainMaster');
  if (chainCount.recordset[0].cnt === 0) {
    console.log('Seeding dbo.ApprovalChainMaster for advances...');
    await pool.request().query(`
      INSERT INTO dbo.ApprovalChainMaster (RequestTypeCode, RegionCode, SequenceOrder, ApproverRole, IsMandatory, SLADays)
      VALUES
        ('SALARY_ADVANCE', 'ALL', 1, 'HOD', 1, 2),
        ('SALARY_ADVANCE', 'ALL', 2, 'HR', 1, 2),
        ('SALARY_ADVANCE', 'ALL', 3, 'FINANCE', 1, 2),
        ('GRATUITY_ADVANCE', 'ALL', 1, 'HOD', 1, 2),
        ('GRATUITY_ADVANCE', 'ALL', 2, 'HR', 1, 2),
        ('GRATUITY_ADVANCE', 'ALL', 3, 'FINANCE', 1, 2);
    `);
    console.log('✔ Seeded approval chain sequences for SALARY_ADVANCE and GRATUITY_ADVANCE');
  }

  // 3. Extend dbo.LetterRequest with Purpose and Addressee
  const lrCols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LetterRequest'
  `);
  const lrColNames = lrCols.recordset.map(c => c.COLUMN_NAME);
  if (!lrColNames.includes('Purpose')) {
    console.log('Adding Purpose to dbo.LetterRequest...');
    await pool.request().query('ALTER TABLE dbo.LetterRequest ADD Purpose nvarchar(255) NULL');
    console.log('✔ Purpose added to LetterRequest');
  } else {
    console.log('✔ Purpose already exists on LetterRequest');
  }

  if (!lrColNames.includes('Addressee')) {
    console.log('Adding Addressee to dbo.LetterRequest...');
    await pool.request().query('ALTER TABLE dbo.LetterRequest ADD Addressee nvarchar(255) NULL');
    console.log('✔ Addressee added to LetterRequest');
  } else {
    console.log('✔ Addressee already exists on LetterRequest');
  }

  // 4. Extend dbo.LetterTemplateMaster with RequiresHODApproval and Language
  const ltmCols = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'LetterTemplateMaster'
  `);
  const ltmColNames = ltmCols.recordset.map(c => c.COLUMN_NAME);
  if (!ltmColNames.includes('RequiresHODApproval')) {
    console.log('Adding RequiresHODApproval to dbo.LetterTemplateMaster...');
    await pool.request().query('ALTER TABLE dbo.LetterTemplateMaster ADD RequiresHODApproval bit NOT NULL DEFAULT 0');
    console.log('✔ RequiresHODApproval added to LetterTemplateMaster');
  } else {
    console.log('✔ RequiresHODApproval already exists on LetterTemplateMaster');
  }

  if (!ltmColNames.includes('Language')) {
    console.log('Adding Language to dbo.LetterTemplateMaster...');
    await pool.request().query('ALTER TABLE dbo.LetterTemplateMaster ADD Language nvarchar(20) NOT NULL DEFAULT \'EN\'');
    console.log('✔ Language added to LetterTemplateMaster');
  } else {
    console.log('✔ Language already exists on LetterTemplateMaster');
  }

  // Standardize CAP Letter naming to match BRD catalog
  await pool.request().query(`
    UPDATE dbo.LetterTemplateMaster
    SET LetterType = 'Corrective Action Plan (CAP) Letter', TemplateName = 'Corrective Action Plan (CAP) Letter'
    WHERE LetterType = 'CAP Letter';
  `);

  // 5. Update CK_AppUser_Role check constraint to allow 'FINANCE' role safely
  const ckRole = await pool.request().query(`
    SELECT CHECK_CLAUSE FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS WHERE CONSTRAINT_NAME = 'CK_AppUser_Role'
  `);
  if (ckRole.recordset.length > 0 && !ckRole.recordset[0].CHECK_CLAUSE.includes('FINANCE')) {
    console.log('Updating CK_AppUser_Role check constraint to include FINANCE...');
    await pool.request().query(`
      ALTER TABLE dbo.AppUser DROP CONSTRAINT CK_AppUser_Role;
      ALTER TABLE dbo.AppUser ADD CONSTRAINT CK_AppUser_Role CHECK (
        [Role]='ADMIN' OR [Role]='HR' OR [Role]='HOD' OR [Role]='EMPLOYEE' OR [Role]='FINANCE'
      );
    `);
    console.log('✔ CK_AppUser_Role updated to include FINANCE');
  }

  // 6. Ensure FINANCE test persona exists for Section 5 Finance approval tier
  const finUser = await pool.request().query(`
    SELECT UserID FROM dbo.AppUser WHERE Role = 'FINANCE'
  `);
  if (finUser.recordset.length === 0) {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('eics@4321', 10);
    let empRes = await pool.request().query(`
      SELECT TOP 1 EmpID FROM dbo.Employee WHERE Designation LIKE '%Finance%'
    `);
    let empId = empRes.recordset[0]?.EmpID;
    if (!empId) {
      const deptRes = await pool.request().query('SELECT TOP 1 DepartmentID FROM dbo.Department');
      const deptId = deptRes.recordset[0]?.DepartmentID || 1;
      const inserted = await pool.request().query(`
        INSERT INTO dbo.Employee (FirstName, LastName, Designation, SubsidiaryID, Status, JoiningDate, Salary, DepartmentID)
        OUTPUT INSERTED.EmpID
        VALUES ('Farhan', 'Finance', 'Senior Finance Specialist', 'saudi', 'Active', '2023-03-01', 14000.00, ${deptId});
      `);
      empId = inserted.recordset[0].EmpID;
    }
    await pool.request().query(`
      INSERT INTO dbo.AppUser (EmpID, Username, PasswordHash, Role, IsActive)
      VALUES (${empId}, 'finance.saudi@eicscomp.com', '${hash}', 'FINANCE', 1);
    `);
    console.log('✔ Finance test persona created (finance.saudi@eicscomp.com)');
  } else {
    console.log('✔ Finance persona already exists');
  }

  console.log('\n--- Current dbo.AdvanceEligibilityRule ---');
  const rules = await pool.request().query('SELECT * FROM dbo.AdvanceEligibilityRule');
  console.table(rules.recordset);

  console.log('\n--- Current dbo.ApprovalChainMaster ---');
  const chains = await pool.request().query('SELECT * FROM dbo.ApprovalChainMaster');
  console.table(chains.recordset);

  await pool.close();
  console.log('\nSchema extension complete!');
}

applySection5Schema().catch(console.error);
