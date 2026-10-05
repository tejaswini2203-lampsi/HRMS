const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString });
  const rows = await pool.request().query('SELECT ConfigKey, ConfigValue, Description FROM dbo.SystemConfig');
  console.log('Total SystemConfig entries:', rows.recordset.length);
  console.table(rows.recordset);

  // If ksaIqama12mFee is missing, insert it
  const has12m = rows.recordset.some(r => r.ConfigKey === 'ksaIqama12mFee');
  if (!has12m) {
    console.log('Inserting default Iqama fees into SystemConfig...');
    await pool.request().query(`
      INSERT INTO dbo.SystemConfig (ConfigKey, ConfigValue, Description)
      VALUES 
        ('ksaIqama12mFee', '10350', 'KSA 12-Month Iqama renewal fee in SAR'),
        ('ksaIqama6mFee', '5175', 'KSA 6-Month Iqama renewal fee in SAR'),
        ('ksaIqama3mFee', '2588', 'KSA 3-Month Iqama renewal fee in SAR');
    `);
    console.log('✔ Inserted ksaIqama12mFee, ksaIqama6mFee, ksaIqama3mFee');
  }

  await pool.close();
}

main().catch(console.error);
