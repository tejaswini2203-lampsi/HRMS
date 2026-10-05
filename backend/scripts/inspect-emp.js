const sql = require('mssql/msnodesqlv8');
const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: CONNECTION });
  const users = await pool.request().query('SELECT UserID, Username, Role, EmpID FROM dbo.AppUser');
  console.table(users.recordset);
  await pool.close();
}
main().catch(console.error);
