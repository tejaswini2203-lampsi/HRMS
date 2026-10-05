const http = require('http');
const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
      },
      (res) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(b) }));
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function prep() {
  const hrRes = await post('/auth/login', { username: 'hr.saudi@eicscomp.com', password: 'eics@4321' });
  const hrToken = hrRes.data.accessToken;

  // Create case for Mudasiir (EmpID: 3)
  const caseRes = await post(
    '/compliance/cases',
    {
      empId: 3,
      regionCode: 'saudi',
      eventCode: 'KSA_IQAMA_RENEWAL',
      pipelineCode: 'KSA_IQAMA',
      priority: 'HIGH',
    },
    hrToken,
  );
  console.log('Created Case:', caseRes.data.CaseID, caseRes.data.CaseNumber);
  const caseId = caseRes.data.CaseID;

  const pool = await sql.connect({ connectionString: CONNECTION });
  const t1 = await pool
    .request()
    .query(
      `SELECT TaskID FROM dbo.WorkQueueTask WHERE SourceModule = 'Compliance' AND SourceID = '${caseId}' AND ActionKey = 'EXPIRY_DETECTED'`,
    );
  const t1Id = t1.recordset[0].TaskID;
  console.log('Step 1 TaskID:', t1Id);

  // Advance to HOD_DURATION
  const advRes = await post(
    `/work-queue/tasks/${t1Id}/execute`,
    { action: 'CONFIRM', comments: 'Expiry verified by HR' },
    hrToken,
  );
  console.log('Advanced to HOD_DURATION:', advRes.data?.action);

  const t2 = await pool
    .request()
    .query(
      `SELECT TaskID, Title, ActionKey, Status, AssignedRole, PrimaryActionLabel FROM dbo.WorkQueueTask WHERE SourceModule = 'Compliance' AND SourceID = '${caseId}' AND ActionKey = 'HOD_DURATION'`,
    );
  console.log('HOD Duration Task ready for browser test:', t2.recordset[0]);

  await pool.close();
}

prep().catch(console.error);
