const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString });

  const count = await pool.request().query('SELECT COUNT(*) as total FROM dbo.PassportAlertLog');
  console.log('Total PassportAlertLog rows:', count.recordset[0].total);

  const cols = await pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'PassportAlertLog'");
  console.log('Columns of PassportAlertLog:');
  console.table(cols.recordset);

  const rows = await pool.request().query('SELECT TOP 10 * FROM dbo.PassportAlertLog ORDER BY 1 DESC');
  console.log('\nTop 10 Most Recent Alerts:');
  console.table(rows.recordset);

  const distinctTypes = await pool.request().query('SELECT AlertType, COUNT(*) as Count FROM dbo.PassportAlertLog GROUP BY AlertType');
  console.log('\nBreakdown of Alert Types:');
  console.table(distinctTypes.recordset);

  const constraints = await pool.request().query(`
    SELECT cc.name AS constraint_name, cc.definition
    FROM sys.check_constraints cc
    JOIN sys.tables t ON cc.parent_object_id = t.object_id
    WHERE t.name = 'PassportAlertLog'
  `);
  console.log('\nCheck Constraints on PassportAlertLog:');
  console.table(constraints.recordset);

  // Test inserting legacy and new alert type to confirm constraint handles both cleanly
  console.log('\nTesting Constraint with transaction rollback:');
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const request = new sql.Request(transaction);
    // Legacy alert type '30d'
    await request.query(`
      INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status)
      VALUES (1, '30d', SYSDATETIME(), 'test@legacy.com', 'SENT');
    `);
    console.log('✔ Successfully inserted legacy alert type: 30d');

    // Legacy alert type '90d'
    await request.query(`
      INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status)
      VALUES (1, '90d', SYSDATETIME(), 'test@legacy.com', 'SENT');
    `);
    console.log('✔ Successfully inserted legacy alert type: 90d');

    // Legacy alert type '180d'
    await request.query(`
      INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status)
      VALUES (1, '180d', SYSDATETIME(), 'test@legacy.com', 'SENT');
    `);
    console.log('✔ Successfully inserted legacy alert type: 180d');

    // New UAE reminder alert type '210d'
    await request.query(`
      INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status)
      VALUES (1, '210d', SYSDATETIME(), 'HR, Employee', 'SENT');
    `);
    console.log('✔ Successfully inserted new UAE reminder alert type: 210d');

    await transaction.rollback();
    console.log('✔ Rolled back test insertions cleanly — zero data pollution.');
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Constraint test failed:', err);
  }

  await pool.close();
}

main().catch(console.error);
