const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function main() {
  console.log('Connecting to MSSQL...');
  const pool = await sql.connect({ connectionString: CONNECTION });

  console.log('1. Checking and extending dbo.DocumentMaster columns safely...');
  
  // Check Status column
  const statusCol = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DocumentMaster' AND COLUMN_NAME = 'Status';
  `);
  if (statusCol.recordset.length === 0) {
    console.log('Adding Status column to DocumentMaster...');
    await pool.request().query(`
      ALTER TABLE dbo.DocumentMaster
      ADD Status nvarchar(30) NOT NULL CONSTRAINT DF_DocumentMaster_Status DEFAULT 'ACTIVE';
    `);
  } else {
    console.log('Status column already exists.');
  }

  // Check SignatureStatus column
  const sigStatusCol = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DocumentMaster' AND COLUMN_NAME = 'SignatureStatus';
  `);
  if (sigStatusCol.recordset.length === 0) {
    console.log('Adding SignatureStatus column to DocumentMaster...');
    await pool.request().query(`
      ALTER TABLE dbo.DocumentMaster
      ADD SignatureStatus nvarchar(30) NOT NULL CONSTRAINT DF_DocumentMaster_SignatureStatus DEFAULT 'NOT_REQUIRED';
    `);
  } else {
    console.log('SignatureStatus column already exists.');
  }

  // Check ParentDocumentID column
  const parentCol = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DocumentMaster' AND COLUMN_NAME = 'ParentDocumentID';
  `);
  if (parentCol.recordset.length === 0) {
    console.log('Adding ParentDocumentID column to DocumentMaster...');
    await pool.request().query(`
      ALTER TABLE dbo.DocumentMaster
      ADD ParentDocumentID int NULL;
    `);
  } else {
    console.log('ParentDocumentID column already exists.');
  }

  // Check Description column
  const descCol = await pool.request().query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DocumentMaster' AND COLUMN_NAME = 'Description';
  `);
  if (descCol.recordset.length === 0) {
    console.log('Adding Description column to DocumentMaster...');
    await pool.request().query(`
      ALTER TABLE dbo.DocumentMaster
      ADD Description nvarchar(500) NULL;
    `);
  } else {
    console.log('Description column already exists.');
  }

  // Update existing Letter documents to SIGNED if they have a signature event
  await pool.request().query(`
    UPDATE d
    SET d.SignatureStatus = 'SIGNED'
    FROM dbo.DocumentMaster d
    WHERE d.Category = 'Letter' AND (
      EXISTS (SELECT 1 FROM dbo.SignatureEvent s WHERE s.DocumentID = d.DocumentID)
      OR EXISTS (SELECT 1 FROM dbo.SignatureEvent s WHERE s.SourceModule = d.SourceModule AND s.SourceID = d.SourceID)
    );
  `);

  console.log('2. Checking and creating dbo.DocumentTypeMaster...');
  const docTypeTable = await pool.request().query(`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DocumentTypeMaster';
  `);
  if (docTypeTable.recordset.length === 0) {
    console.log('Creating dbo.DocumentTypeMaster table...');
    await pool.request().query(`
      CREATE TABLE dbo.DocumentTypeMaster (
        TypeCode nvarchar(50) NOT NULL PRIMARY KEY,
        TypeName nvarchar(100) NOT NULL,
        Category nvarchar(50) NOT NULL,
        DefaultSourceModule nvarchar(50) NOT NULL,
        RequiresSignature bit NOT NULL DEFAULT 0,
        IsActive bit NOT NULL DEFAULT 1,
        CreatedAt datetime2 NOT NULL DEFAULT sysdatetime()
      );
    `);
  } else {
    console.log('DocumentTypeMaster already exists.');
  }

  // Seed standard BRD Section 4 & existing document types
  const typesToSeed = [
    { code: 'OFFER_LETTER', name: 'Offer Letter', category: 'Offer Letter', module: 'GENERAL', sig: 1 },
    { code: 'POLICY_ACK', name: 'Policy Acknowledgment', category: 'Policy Acknowledgment', module: 'GENERAL', sig: 1 },
    { code: 'ID_COPY', name: 'ID Copy', category: 'ID Copy', module: 'GENERAL', sig: 0 },
    { code: 'CERTIFICATE', name: 'Certificate', category: 'Certificate', module: 'GENERAL', sig: 0 },
    { code: 'COMPLIANCE_DOC', name: 'Compliance Document', category: 'Compliance Document', module: 'COMPLIANCE', sig: 0 },
    { code: 'CONTRACT', name: 'Contract', category: 'Contract', module: 'COMPLIANCE', sig: 1 },
    { code: 'LETTER', name: 'Letter', category: 'Letter', module: 'LETTER_REQUEST', sig: 1 },
    { code: 'PERFORMANCE_RECORD', name: 'Performance Record', category: 'Performance Record', module: 'PERFORMANCE', sig: 0 },
    { code: 'PASSPORT', name: 'Passport', category: 'Passport', module: 'GENERAL', sig: 0 },
    { code: 'VISA', name: 'Visa', category: 'Visa', module: 'COMPLIANCE', sig: 0 },
    { code: 'NATIONAL_ID', name: 'National ID / Iqama / Emirates ID', category: 'NationalID', module: 'COMPLIANCE', sig: 0 },
    { code: 'OTHER', name: 'Other', category: 'Other', module: 'GENERAL', sig: 0 },
  ];

  for (const t of typesToSeed) {
    const existing = await pool.request().query(`
      SELECT TypeCode FROM dbo.DocumentTypeMaster WHERE TypeCode = '${t.code}';
    `);
    if (existing.recordset.length === 0) {
      await pool.request().query(`
        INSERT INTO dbo.DocumentTypeMaster (TypeCode, TypeName, Category, DefaultSourceModule, RequiresSignature, IsActive)
        VALUES ('${t.code}', '${t.name}', '${t.category}', '${t.module}', ${t.sig}, 1);
      `);
      console.log(`Seeded DocumentType: ${t.name}`);
    }
  }

  console.log('3. Verification of DocumentMaster columns:');
  const cols = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'DocumentMaster'
    ORDER BY ORDINAL_POSITION;
  `);
  console.table(cols.recordset);

  console.log('4. Verification of DocumentTypeMaster rows:');
  const seededTypes = await pool.request().query(`SELECT * FROM dbo.DocumentTypeMaster ORDER BY TypeCode;`);
  console.table(seededTypes.recordset);

  await pool.close();
  console.log('Schema update complete and non-destructive!');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
