const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString });
  
  await pool.request().query("UPDATE dbo.Employee SET SubsidiaryID = 'saudi' WHERE EmpID = 21");
  await pool.request().query("UPDATE dbo.Employee SET UAEEmployeeCategory = 'Labor' WHERE EmpID = 17");
  console.log('✔ Updated EmpID 21 SubsidiaryID = saudi, EmpID 17 UAEEmployeeCategory = Labor');

  const users = await pool.request().query(`
    SELECT u.UserID, u.Username, u.Role, e.EmpID, e.FirstName, e.LastName, e.SubsidiaryID
    FROM dbo.AppUser u
    JOIN dbo.Employee e ON u.EmpID = e.EmpID
    WHERE u.Username IN ('hr.saudi@eicscomp.com', 'hr.uae@eicscomp.com', 'admin@eicscomp.com');
  `);
  console.log('HR Users in DB:');
  console.table(users.recordset);
  await pool.close();
}

main().catch(console.error);
