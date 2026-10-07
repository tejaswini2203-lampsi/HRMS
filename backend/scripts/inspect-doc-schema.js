const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: CONNECTION });

  await pool.request().query("UPDATE dbo.Employee SET SubsidiaryID = 'saudi' WHERE EmpID = 21;");
  const check = await pool.request().query("SELECT EmpID, FirstName, LastName, SubsidiaryID FROM dbo.Employee WHERE EmpID = 21;");
  console.log('Fixed Emp 21:', check.recordset);
  await pool.close();
  return;

  console.log('=== SAMPLE DocumentMaster ROWS ===');
  const docs = await pool.request().query(`
    SELECT TOP 10 DocumentID, Category, SourceModule, SourceID, EmpID, RegionCode, FileName, Version, IsActiveVersion, UploadedByEmpID, CreatedAt
    FROM dbo.DocumentMaster
    ORDER BY DocumentID DESC;
  `);
  console.table(docs.recordset);

  console.log('=== SAMPLE SignatureEvent ROWS ===');
  const sigs = await pool.request().query(`
    SELECT TOP 10 SignatureID, DocumentID, SourceModule, SourceID, SignerEmpID, SignerName, SignerRole, SignedAt
    FROM dbo.SignatureEvent
    ORDER BY SignatureID DESC;
  `);
  console.table(sigs.recordset);

  await pool.close();
}

main().catch(console.error);
