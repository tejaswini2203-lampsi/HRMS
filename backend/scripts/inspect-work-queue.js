const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: CONNECTION });
  const tasks = await pool.request().query(`
    SELECT TaskID, SourceModule, SourceID, ActionKey, TargetEmpID, AssignedRole, Title, Status, PrimaryActionLabel 
    FROM dbo.WorkQueueTask 
    WHERE Status = 'OPEN'
    ORDER BY TaskID ASC
  `);
  console.log('Work Queue Tasks:');
  console.table(tasks.recordset);
  await pool.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
