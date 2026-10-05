/**
 * Non-destructive updates:
 * - Notification table (persistent read/unread + workflow events)
 * - Additional departments (no duplicates)
 * - Realistic names for known demo employees only (EmpID 1, 2, 3)
 */
const sql = require('mssql/msnodesqlv8')

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;'

;(async () => {
  const pool = await sql.connect({ connectionString: CONNECTION })

  await pool.request().query(`
    IF OBJECT_ID('dbo.Notification', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Notification (
        NotificationID int IDENTITY(1,1) NOT NULL CONSTRAINT PK_Notification PRIMARY KEY,
        RecipientUserID int NOT NULL,
        RecipientEmpID int NOT NULL,
        Type nvarchar(50) NOT NULL,
        Title nvarchar(200) NOT NULL,
        Message nvarchar(2000) NOT NULL,
        RelatedEntity nvarchar(50) NULL,
        RelatedEntityID int NULL,
        IsRead bit NOT NULL CONSTRAINT DF_Notification_IsRead DEFAULT (0),
        CreatedAt datetime2 NOT NULL CONSTRAINT DF_Notification_CreatedAt DEFAULT (SYSDATETIME()),
        CONSTRAINT FK_Notification_AppUser FOREIGN KEY (RecipientUserID) REFERENCES dbo.AppUser(UserID),
        CONSTRAINT FK_Notification_Employee FOREIGN KEY (RecipientEmpID) REFERENCES dbo.Employee(EmpID)
      );
      CREATE INDEX IX_Notification_RecipientUserID ON dbo.Notification(RecipientUserID, IsRead, CreatedAt DESC);
    END
  `)
  console.log('OK Notification table')

  const depts = [
    'Installation',
    'Project',
    'Finance',
    'Operations',
    'Production',
    'Digital',
  ]
  for (const name of depts) {
    const existing = await pool
      .request()
      .input('departmentName', name)
      .query(
        `SELECT DepartmentID FROM dbo.Department WHERE DepartmentName = @departmentName`,
      )
    if (existing.recordset.length) {
      console.log('Skip existing department', name)
    } else {
      await pool
        .request()
        .input('departmentName', name)
        .query(`INSERT INTO dbo.Department (DepartmentName) VALUES (@departmentName)`)
      console.log('Inserted department', name)
    }
  }

  // Demo employees only — keep EmpIDs and AppUser usernames intact
  await pool.request().query(`
    UPDATE dbo.Employee
    SET FirstName = 'Akshay', LastName = 'Reddy', MiddleName = NULL, UpdatedAt = SYSDATETIME()
    WHERE EmpID = 1 AND FirstName = 'Test' AND LastName = 'Employee';

    UPDATE dbo.Employee
    SET FirstName = 'Priya', LastName = 'Nair', MiddleName = NULL, UpdatedAt = SYSDATETIME()
    WHERE EmpID = 2 AND FirstName = 'Approver' AND LastName = 'Manager';

    UPDATE dbo.Employee
    SET FirstName = 'Rahul', LastName = 'Kumar', MiddleName = NULL, UpdatedAt = SYSDATETIME()
    WHERE EmpID = 3 AND FirstName = 'Integration' AND LastName = 'Tester';
  `)
  console.log('OK demo employee names (only if still generic)')

  await pool.close()
  console.log('Feature schema apply complete')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
