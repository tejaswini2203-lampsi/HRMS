const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: CONNECTION });

  console.log('--- WORK QUEUE TASKS ---');
  const tasks = await pool.request().query(`
    SELECT TaskID, SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, Title, PrimaryActionLabel, Status
    FROM dbo.WorkQueueTask
    ORDER BY TaskID;
  `);
  console.table(tasks.recordset);

  console.log('--- COMPLIANCE CASES ---');
  const cases = await pool.request().query(`
    SELECT CaseID, CaseNumber, EmpID, RegionCode, EventCode, PipelineCode, CurrentStageKey, Status, DueDate, MetaJson
    FROM dbo.ComplianceCase
    ORDER BY CaseID;
  `);
  console.table(cases.recordset);

  console.log('--- LETTER TEMPLATES ---');
  const tpls = await pool.request().query(`
    SELECT TemplateID, LetterType, RegionCode, RequiresHODApproval, IsActive FROM dbo.LetterTemplateMaster;
  `);
  console.table(tpls.recordset);

  console.log('--- DOCUMENT MASTER ---');
  const docs = await pool.request().query(`
    SELECT DocumentID, Category, SourceModule, SourceID, EmpID, FileName, MimeType, FileSize, CreatedAt
    FROM dbo.DocumentMaster
    ORDER BY DocumentID;
  `);
  console.table(docs.recordset);

  console.log('--- RECENT AUDIT LOGS ---');
  const audit = await pool.request().query(`
    SELECT TOP 10 AuditID, Action, Module, RecordID, ActorName, ActorRole, Timestamp
    FROM dbo.AuditEvent
    ORDER BY AuditID DESC;
  `);
  console.table(audit.recordset);

  console.log('--- CHECK CONSTRAINTS ---');
  const ck = await pool.request().query(`
    SELECT CONSTRAINT_NAME, CHECK_CLAUSE FROM INFORMATION_SCHEMA.CHECK_CONSTRAINTS;
  `);
  console.table(ck.recordset);

  await pool.close();
}

main().catch(console.error);
