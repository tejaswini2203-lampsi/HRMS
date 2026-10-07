const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString: CONNECTION });
  await pool.request().query(`
    UPDATE dbo.LetterTemplateMaster SET IsActive = 1 WHERE LetterType = 'Internship Certificate' AND Version = 1;
    DELETE FROM dbo.LetterTemplateMaster WHERE LetterType = 'Internship Certificate' AND Version > 1;
  `);
  const tpls = await pool.request().query(`
    SELECT TemplateID, TemplateCode, LetterType, Version, RequiresHODApproval, IsActive FROM dbo.LetterTemplateMaster;
  `);
  console.table(tpls.recordset);
  await pool.close();
}

main().catch(console.error);
