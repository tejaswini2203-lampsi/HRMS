/**
 * Non-destructive schema updates for UAT requirements:
 * - AppUser table (auth + admin roles)
 * - LeaveRequest.LeaveDayType
 * - Employee.Email
 * Seed AppUser rows for demo logins (bcrypt hashes)
 */
const sql = require('mssql/msnodesqlv8')
const bcrypt = require('bcrypt')

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;'

const DEMO_PASSWORD = process.env.EICS_SEED_PASSWORD || 'eics@4321'

;(async () => {
  const pool = await sql.connect({ connectionString: CONNECTION })

  await pool.request().query(`
    IF COL_LENGTH('dbo.Employee', 'Email') IS NULL
    BEGIN
      ALTER TABLE dbo.Employee ADD Email nvarchar(255) NULL;
    END
  `)
  console.log('OK Employee.Email')

  await pool.request().query(`
    IF COL_LENGTH('dbo.LeaveRequest', 'LeaveDayType') IS NULL
    BEGIN
      ALTER TABLE dbo.LeaveRequest ADD LeaveDayType nvarchar(10) NOT NULL
        CONSTRAINT DF_LeaveRequest_LeaveDayType DEFAULT ('FULL');
    END
  `)
  console.log('OK LeaveRequest.LeaveDayType column')

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.check_constraints
      WHERE name = 'CK_LeaveRequest_LeaveDayType'
    )
    BEGIN
      ALTER TABLE dbo.LeaveRequest WITH NOCHECK
        ADD CONSTRAINT CK_LeaveRequest_LeaveDayType
        CHECK (LeaveDayType IN ('FULL', 'HALF'));
    END
  `)
  console.log('OK LeaveRequest LeaveDayType CHECK')

  await pool.request().query(`
    IF OBJECT_ID('dbo.AppUser', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AppUser (
        UserID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_AppUser PRIMARY KEY,
        EmpID int NOT NULL,
        Username nvarchar(100) NOT NULL,
        PasswordHash nvarchar(255) NOT NULL,
        Role nvarchar(20) NOT NULL,
        IsActive bit NOT NULL CONSTRAINT DF_AppUser_IsActive DEFAULT (1),
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_AppUser_CreatedAt DEFAULT (SYSDATETIME()),
        UpdatedAt datetime2 NOT NULL CONSTRAINT DF_AppUser_UpdatedAt DEFAULT (SYSDATETIME()),
        CONSTRAINT UQ_AppUser_Username UNIQUE (Username),
        CONSTRAINT FK_AppUser_Employee FOREIGN KEY (EmpID) REFERENCES dbo.Employee(EmpID),
        CONSTRAINT CK_AppUser_Role CHECK (Role IN ('EMPLOYEE', 'HOD', 'HR', 'ADMIN'))
      );
      CREATE INDEX IX_AppUser_EmpID ON dbo.AppUser(EmpID);
    END
  `)
  console.log('OK AppUser table')

  // Ensure Emp 1 is Active so employee login maps to a usable employee
  await pool.request().query(`
    UPDATE dbo.Employee
    SET Status = 'Active', UpdatedAt = SYSDATETIME()
    WHERE EmpID = 1 AND Status <> 'Active';
  `)

  // Seed demo emails (nullable-safe)
  await pool.request().query(`
    UPDATE dbo.Employee SET Email = 'employee@eicscomp.com' WHERE EmpID = 1 AND (Email IS NULL OR Email = '');
    UPDATE dbo.Employee SET Email = 'approver@eicscomp.com' WHERE EmpID = 2 AND (Email IS NULL OR Email = '');
    UPDATE dbo.Employee SET Email = 'tester@eicscomp.com' WHERE EmpID = 3 AND (Email IS NULL OR Email = '');
  `)
  console.log('OK Employee email seeds')

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const users = [
    { username: 'employee@eicscomp.com', empId: 1, role: 'EMPLOYEE' },
    { username: 'hod@eicscomp.com', empId: 2, role: 'HOD' },
    { username: 'hr@eicscomp.com', empId: 2, role: 'HR' },
    { username: 'admin@eicscomp.com', empId: 2, role: 'ADMIN' },
  ]

  for (const u of users) {
    const existing = await pool
      .request()
      .input('username', u.username)
      .query(`SELECT UserID FROM dbo.AppUser WHERE Username = @username`)
    if (existing.recordset.length) {
      await pool
        .request()
        .input('username', u.username)
        .input('hash', hash)
        .input('role', u.role)
        .input('empId', u.empId)
        .query(`
          UPDATE dbo.AppUser
          SET PasswordHash = @hash,
              Role = @role,
              EmpID = @empId,
              IsActive = 1,
              UpdatedAt = SYSDATETIME()
          WHERE Username = @username
        `)
      console.log('Updated user', u.username)
    } else {
      await pool
        .request()
        .input('username', u.username)
        .input('hash', hash)
        .input('role', u.role)
        .input('empId', u.empId)
        .query(`
          INSERT INTO dbo.AppUser (EmpID, Username, PasswordHash, Role, IsActive)
          VALUES (@empId, @username, @hash, @role, 1)
        `)
      console.log('Inserted user', u.username)
    }
  }

  await pool.close()
  console.log('Schema apply complete')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
