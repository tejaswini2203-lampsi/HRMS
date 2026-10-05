const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};' +
  'Server=localhost\\SQLEXPRESS02;' +
  'Database=EICS_DB;' +
  'Trusted_Connection=Yes;' +
  'TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString });
  console.log('Connected to EICS_DB!');

  console.log('\n=== RECENT CORPORATE LETTERS & DOCUMENTS (DocumentMaster) ===');
  const docs = await pool.request().query(`
    SELECT TOP 5 DocumentID, EmpID, Category, SourceModule, FileName, MimeType, FileSize, CreatedAt, FilePath 
    FROM dbo.DocumentMaster 
    ORDER BY DocumentID DESC;
  `);
  console.table(docs.recordset);

  console.log('\n=== RECENT LETTER REQUESTS (LetterRequest) ===');
  const lrs = await pool.request().query(`
    SELECT TOP 5 * 
    FROM dbo.LetterRequest 
    ORDER BY LetterRequestID DESC;
  `);
  console.table(lrs.recordset);

  console.log('\n=== RECENT COMPLIANCE CASES (ComplianceCase) ===');
  const cases = await pool.request().query(`
    SELECT TOP 5 * 
    FROM dbo.ComplianceCase 
    ORDER BY CaseID DESC;
  `);
  console.table(cases.recordset);

  console.log('\n=== RECENT WORK QUEUE TASKS (WorkQueueTask) ===');
  const tasks = await pool.request().query(`
    SELECT TOP 8 TaskID, SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, Title, Status, CompletedAt 
    FROM dbo.WorkQueueTask 
    ORDER BY TaskID DESC;
  `);
  console.table(tasks.recordset);

  console.log('\n=== RECENT AUDIT EVENTS (AuditEvent) ===');
  const audits = await pool.request().query(`
    SELECT TOP 10 * 
    FROM dbo.AuditEvent 
    ORDER BY AuditID DESC;
  `);
  console.table(audits.recordset);

  console.log('\n=== UAE AUDIT EVENTS ===');
  const uaeAudits = await pool.request().query(`
    SELECT TOP 10 AuditID, Action, Module, RecordID, ActorName, ActorRole, BeforeValue, AfterValue, Timestamp 
    FROM dbo.AuditEvent 
    WHERE RegionCode = 'uae'
    ORDER BY AuditID DESC;
  `);
  console.table(uaeAudits.recordset);

  console.log('\n=== UAE COMPLIANCE CASES & TASKS ===');
  const uaeCases = await pool.request().query(`
    SELECT TOP 5 CaseID, CaseNumber, EmpID, RegionCode, EventCode, CurrentStageKey, Status, CreatedAt 
    FROM dbo.ComplianceCase 
    WHERE RegionCode = 'uae'
    ORDER BY CaseID DESC;
  `);
  console.table(uaeCases.recordset);

  const uaeTasks = await pool.request().query(`
    SELECT TOP 10 TaskID, SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, Title, Status, CompletedAt 
    FROM dbo.WorkQueueTask 
    WHERE RegionCode = 'uae'
    ORDER BY TaskID DESC;
  `);
  console.table(uaeTasks.recordset);

  await pool.close();
}

main().catch(console.error);
