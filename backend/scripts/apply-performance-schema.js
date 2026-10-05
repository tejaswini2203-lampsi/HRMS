const sql = require('mssql/msnodesqlv8');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  const pool = await sql.connect({ connectionString });
  console.log('Connected to EICS_DB to apply safe Section 4 Performance schema updates...');

  // 1. Check constraints on Sentiment and Priority
  const existingConstraints = await pool.request().query(`
    SELECT name FROM sys.check_constraints WHERE parent_object_id = OBJECT_ID('dbo.PerformanceComment');
  `);
  const names = existingConstraints.recordset.map(r => r.name);

  if (!names.includes('CK_PerformanceComment_Sentiment')) {
    console.log('Adding CK_PerformanceComment_Sentiment...');
    await pool.request().query(`
      ALTER TABLE dbo.PerformanceComment
      ADD CONSTRAINT CK_PerformanceComment_Sentiment
      CHECK (UPPER(Sentiment) IN ('GOOD', 'BAD'));
    `);
    console.log('✔ CK_PerformanceComment_Sentiment added');
  } else {
    console.log('✔ CK_PerformanceComment_Sentiment already exists');
  }

  if (!names.includes('CK_PerformanceComment_Weight')) {
    console.log('Adding CK_PerformanceComment_Weight...');
    await pool.request().query(`
      ALTER TABLE dbo.PerformanceComment
      ADD CONSTRAINT CK_PerformanceComment_Weight
      CHECK (UPPER(Priority) IN ('NORMAL', 'HIGH'));
    `);
    console.log('✔ CK_PerformanceComment_Weight added');
  } else {
    console.log('✔ CK_PerformanceComment_Weight already exists');
  }

  // 2. Check Index on (EmpID, CreatedAt DESC)
  const existingIndexes = await pool.request().query(`
    SELECT name FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.PerformanceComment') AND name = 'IX_PerformanceComment_Emp_Created';
  `);
  if (existingIndexes.recordset.length === 0) {
    console.log('Creating IX_PerformanceComment_Emp_Created index...');
    await pool.request().query(`
      CREATE NONCLUSTERED INDEX IX_PerformanceComment_Emp_Created
      ON dbo.PerformanceComment (EmpID, CreatedAt DESC);
    `);
    console.log('✔ IX_PerformanceComment_Emp_Created created');
  } else {
    console.log('✔ IX_PerformanceComment_Emp_Created already exists');
  }

  // 3. Normalize existing records Sentiment and Priority to standard case
  await pool.request().query(`
    UPDATE dbo.PerformanceComment
    SET Sentiment = UPPER(Sentiment),
        Priority = UPPER(Priority)
    WHERE Sentiment != UPPER(Sentiment) OR Priority != UPPER(Priority);
  `);
  console.log('✔ Normalized existing comments to uppercase tags');

  const rows = await pool.request().query(`SELECT * FROM dbo.PerformanceComment ORDER BY CommentID DESC`);
  console.log('Current rows in dbo.PerformanceComment:');
  console.table(rows.recordset);

  await pool.close();
}

main().catch(console.error);
