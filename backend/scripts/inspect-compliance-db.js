const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString });
  const tables = await pool.request().query(`
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME;
  `);
  console.log('=== ALL DATABASE TABLES ===');
  console.table(tables.recordset);

  // Check columns of ComplianceCase
  console.log('=== COMPLIANCE CASE COLUMNS ===');
  const caseCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ComplianceCase';
  `);
  console.table(caseCols.recordset);

  // Check columns of CaseDependency
  console.log('=== CASE DEPENDENCY COLUMNS ===');
  const depCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CaseDependency';
  `);
  console.table(depCols.recordset);

  // Check columns of CaseChecklistProgress
  console.log('=== CASE CHECKLIST PROGRESS COLUMNS ===');
  const checkCols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'CaseChecklistProgress';
  `);
  console.table(checkCols.recordset);

  await pool.close();
}

main().catch(console.error);
