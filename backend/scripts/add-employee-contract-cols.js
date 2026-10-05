const sql = require('mssql/msnodesqlv8');
const connStr =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: connStr });
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Employee' AND COLUMN_NAME = 'ContractExpiry')
    BEGIN
      ALTER TABLE dbo.Employee ADD ContractExpiry date NULL;
      PRINT 'Added ContractExpiry to Employee';
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Employee' AND COLUMN_NAME = 'ContractRenewalCount')
    BEGIN
      ALTER TABLE dbo.Employee ADD ContractRenewalCount int NULL DEFAULT 0;
      PRINT 'Added ContractRenewalCount to Employee';
    END

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Employee' AND COLUMN_NAME = 'IsSaudiNational')
    BEGIN
      ALTER TABLE dbo.Employee ADD IsSaudiNational bit NULL DEFAULT 0;
      PRINT 'Added IsSaudiNational to Employee';
    END
  `);

  // Ensure Mudasiir (EmpID: 3) has sample contract expiry within 75 days for contract renewal testing if not set
  await pool.request().query(`
    UPDATE dbo.Employee
    SET ContractExpiry = DATEADD(day, 65, CAST(GETDATE() AS DATE)),
        ContractRenewalCount = 1,
        IsSaudiNational = 0
    WHERE EmpID = 3 AND ContractExpiry IS NULL;
  `);

  console.log('✅ Employee contract columns verified/added.');
  await pool.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
