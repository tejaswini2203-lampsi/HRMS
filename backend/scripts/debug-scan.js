const sql = require('mssql/msnodesqlv8');
const DB_CONN =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: DB_CONN });
  console.log('Connected to DB');

  try {
    console.log('1. Querying active employees...');
    const employees = await pool.request().query(`
      SELECT
        EmpID,
        FirstName,
        LastName,
        SubsidiaryID,
        EmploymentType,
        UAEEmployeeCategory,
        IqamaExpiry,
        VisaExpiry,
        ContractExpiry,
        ContractRenewalCount,
        IsSaudiNational,
        Status
      FROM dbo.Employee
      WHERE Status = 'Active';
    `);
    console.log('   Employees found:', employees.recordset.length);

    console.log('2. Querying configs...');
    const configRows = await pool.request().query(
      `SELECT ConfigKey, ConfigValue FROM dbo.SystemConfig;`,
    );
    console.log('   Configs found:', configRows.recordset.length);

    console.log('3. Checking Passport alerts logic...');
    const passports = await pool.request().query(`
      SELECT
        p.PassportID,
        p.EmpID,
        p.PassportNumber,
        p.ExpiryDate,
        e.FirstName,
        e.LastName,
        e.SubsidiaryID
      FROM dbo.PassportDetail p
      INNER JOIN dbo.Employee e ON p.EmpID = e.EmpID
      WHERE p.IsActive = 1 AND e.Status = 'Active';
    `);
    console.log('   Passports found:', passports.recordset.length);

    console.log('4. Testing case creation logic...');
    // test checking existing cases
    const existing = await pool.request().query(`
      SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = 18 AND EventCode = 'KSA_CONTRACT_RENEWAL' AND Status NOT IN ('COMPLETED', 'CANCELLED');
    `);
    console.log('   Existing checked:', existing.recordset);

  } catch (err) {
    console.error('❌ Error caught:', err);
  }

  await pool.close();
}

main().catch(console.error);
