const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString });
  const cols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PerformanceComment'");
  console.log('Columns of PerformanceComment:');
  console.table(cols.recordset);

  const constraints = await pool.request().query(`
    SELECT cc.name, cc.definition 
    FROM sys.check_constraints cc
    JOIN sys.tables t ON cc.parent_object_id = t.object_id
    WHERE t.name = 'PerformanceComment'
  `);
  console.log('Check Constraints:');
  console.table(constraints.recordset);

  const rows = await pool.request().query('SELECT * FROM dbo.PerformanceComment');
  console.log('Existing comments count:', rows.recordset.length);
  console.table(rows.recordset);

  await pool.close();
}

main().catch(console.error);
