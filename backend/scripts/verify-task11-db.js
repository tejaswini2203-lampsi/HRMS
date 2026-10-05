const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: CONNECTION });

  console.log('\n--- WorkQueueTask 11 ---');
  const taskRes = await pool.request().query(
    'SELECT TaskID, SourceModule, SourceID, Status, CompletedByEmpID, CompletedAt FROM dbo.WorkQueueTask WHERE TaskID = 11'
  );
  console.table(taskRes.recordset);

  console.log('\n--- LetterRequest 2 ---');
  const letterRes = await pool.request().query(
    'SELECT * FROM dbo.LetterRequest WHERE LetterRequestID = 2'
  );
  console.table(letterRes.recordset);

  const docId = letterRes.recordset[0]?.GeneratedDocumentID;
  if (docId) {
    console.log(`\n--- DocumentMaster (DocumentID: ${docId}) ---`);
    const docRes = await pool.request().query(
      `SELECT * FROM dbo.DocumentMaster WHERE DocumentID = ${docId}`
    );
    console.table(docRes.recordset);
  }

  console.log('\n--- Recent Audit Events ---');
  const auditRes = await pool.request().query(
    'SELECT TOP 5 * FROM dbo.AuditEvent ORDER BY AuditID DESC'
  );
  console.table(auditRes.recordset);

  await pool.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
