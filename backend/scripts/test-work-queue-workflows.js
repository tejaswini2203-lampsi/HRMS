const http = require('http');
const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

function postJson(path, data, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJson(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, data: body });
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function testWorkflows() {
  console.log('=== STARTING WORK QUEUE FUNCTIONAL LIFECYCLE TESTS ===');

  // Authenticate
  const hrLogin = await postJson('/auth/login', { username: 'hr.uae@eicscomp.com', password: 'eics@4321' });
  const hrToken = hrLogin.data.accessToken;
  const hodLogin = await postJson('/auth/login', { username: 'hod.saudi@eicscomp.com', password: 'eics@4321' });
  const hodToken = hodLogin.data.accessToken;

  console.log('✅ Authenticated HR and HOD test users.');

  // Test D: Failure Handling - Rejection without comments must be rejected by backend
  console.log('\n--- Scenario D: Failure Handling (Rejection Without Reason) ---');
  const failRes = await postJson('/work-queue/tasks/7/execute', { action: 'REJECT', comments: '   ' }, hrToken);
  console.log(`Response status for empty rejection comments: ${failRes.status}`);
  if (failRes.status === 400) {
    console.log(`✅ Correctly rejected invalid submission: "${failRes.data.message}"`);
  } else {
    throw new Error(`Expected HTTP 400 for empty rejection reason, got ${failRes.status}`);
  }

  // Test A: KSA Iqama (Task 7 - Mudasiir Start Renewal)
  console.log('\n--- Scenario A: KSA Iqama Renewal (Start Renewal -> Advance to HOD Duration) ---');
  // First inspect task 7 context
  const task7Details = await getJson('/work-queue/tasks/7', hrToken);
  console.log(`Task 7 Title: "${task7Details.data.Title}"`);
  console.log(`Target: ${task7Details.data.TargetFirstName} ${task7Details.data.TargetLastName} (ID: ${task7Details.data.TargetEmpID})`);
  console.log(`Iqama Number: ${task7Details.data.IqamaNumber} | Expiry: ${task7Details.data.IqamaExpiry}`);
  console.log(`Case: ${task7Details.data.context?.complianceCase?.CaseNumber} | Current Stage: ${task7Details.data.context?.complianceCase?.CurrentStageKey}`);
  
  // Submit Start Renewal
  const startRenewalRes = await postJson(
    '/work-queue/tasks/7/execute',
    { action: 'CONFIRM', comments: 'HR initiated Iqama renewal workflow' },
    hrToken,
  );
  console.log('Start Renewal response:', startRenewalRes.status, startRenewalRes.data);
  if (startRenewalRes.status !== 200 && startRenewalRes.status !== 201) {
    throw new Error('Start Renewal failed');
  }

  // Verify DB for Case 4
  const pool = await sql.connect({ connectionString: CONNECTION });
  const case4 = await pool.request().query('SELECT * FROM dbo.ComplianceCase WHERE CaseID = 4');
  console.log(`Case 4 updated stage in DB: ${case4.recordset[0].CurrentStageKey} (Status: ${case4.recordset[0].Status})`);
  if (case4.recordset[0].CurrentStageKey !== 'HOD_DURATION') {
    throw new Error(`Expected stage HOD_DURATION, got ${case4.recordset[0].CurrentStageKey}`);
  }

  // Check new HOD Duration task in WorkQueueTask
  const newHodTask = await pool.request().query(
    "SELECT * FROM dbo.WorkQueueTask WHERE SourceModule = 'Compliance' AND SourceID = '4' AND ActionKey = 'HOD_DURATION' AND Status = 'OPEN'",
  );
  if (newHodTask.recordset.length === 0) {
    throw new Error('HOD_DURATION task was not generated!');
  }
  const hodTaskId = newHodTask.recordset[0].TaskID;
  console.log(`✅ New HOD Task Generated: TaskID ${hodTaskId} ("${newHodTask.recordset[0].Title}")`);

  // Now Test Scenario A (part 2): Select Duration (12 Months)
  console.log(`\n--- Scenario A (Part 2): HOD selects 12 Months duration on Task ${hodTaskId} ---`);
  const durationRes = await postJson(
    `/work-queue/tasks/${hodTaskId}/execute`,
    { action: 'CONFIRM', comments: 'HOD confirmed standard 12 months duration', meta: { durationMonths: 12 } },
    hodToken,
  );
  console.log('Duration confirmation response:', durationRes.status, durationRes.data);
  if (durationRes.status !== 200 && durationRes.status !== 201) {
    throw new Error('Select Duration failed');
  }

  // Verify Case 4 after duration confirmation
  const case4AfterDur = await pool.request().query('SELECT * FROM dbo.ComplianceCase WHERE CaseID = 4');
  console.log(`Case 4 new stage: ${case4AfterDur.recordset[0].CurrentStageKey} | MetaJson: ${case4AfterDur.recordset[0].MetaJson}`);
  if (case4AfterDur.recordset[0].CurrentStageKey !== 'VENDOR_ADMIN') {
    throw new Error(`Expected VENDOR_ADMIN stage, got ${case4AfterDur.recordset[0].CurrentStageKey}`);
  }
  console.log('✅ KSA Iqama Renewal & Duration Selection successfully persisted and advanced to VENDOR_ADMIN!');

  // Test B: UAE Visa (Task 8 - Sashi Start Renewal)
  console.log('\n--- Scenario B: UAE Visa Renewal (Start Renewal -> Advance to Pending Docs) ---');
  const task8Details = await getJson('/work-queue/tasks/8', hrToken);
  console.log(`Task 8 Title: "${task8Details.data.Title}"`);
  console.log(`Target: ${task8Details.data.TargetFirstName} ${task8Details.data.TargetLastName} (ID: ${task8Details.data.TargetEmpID})`);
  console.log(`Visa Number: ${task8Details.data.VisaNumber} | Expiry: ${task8Details.data.VisaExpiry}`);
  console.log(`Checklist items: ${task8Details.data.context?.checklist?.length} items`);

  const uaeStartRes = await postJson(
    '/work-queue/tasks/8/execute',
    { action: 'CONFIRM', comments: 'HR initiated UAE visa renewal process' },
    hrToken,
  );
  console.log('UAE Start Renewal response:', uaeStartRes.status, uaeStartRes.data);
  if (uaeStartRes.status !== 200 && uaeStartRes.status !== 201) {
    throw new Error('UAE Visa Start Renewal failed');
  }

  const case5 = await pool.request().query('SELECT * FROM dbo.ComplianceCase WHERE CaseID = 5');
  console.log(`Case 5 updated stage in DB: ${case5.recordset[0].CurrentStageKey}`);
  if (case5.recordset[0].CurrentStageKey !== 'PENDING_DOCS') {
    throw new Error(`Expected PENDING_DOCS, got ${case5.recordset[0].CurrentStageKey}`);
  }
  console.log('✅ UAE Visa renewal advanced to PENDING_DOCS and persisted in DB!');

  // Test C: Experience Letter (Task 5 - Saleem Experience Letter)
  console.log('\n--- Scenario C: Review Letter & Issue Document ---');
  const task5Details = await getJson('/work-queue/tasks/5', hrToken);
  console.log(`Task 5 Title: "${task5Details.data.Title}"`);
  console.log(`Target: ${task5Details.data.TargetFirstName} ${task5Details.data.TargetLastName} (ID: ${task5Details.data.TargetEmpID})`);
  console.log(`Letter Request Code: ${task5Details.data.context?.letterRequest?.RequestCode}`);
  console.log(`Employee Purpose: "${task5Details.data.context?.letterRequest?.Remarks}"`);

  // Approve & Issue Letter
  const letterRes = await postJson(
    '/work-queue/tasks/5/execute',
    { action: 'CONFIRM', comments: 'Verified employment tenure and salary; approved for banking' },
    hrToken,
  );
  console.log('Review Letter response:', letterRes.status, letterRes.data);
  if (letterRes.status !== 200 && letterRes.status !== 201) {
    throw new Error('Review Letter execution failed');
  }

  // Verify DB for LetterRequest 1
  const letter1 = await pool.request().query('SELECT * FROM dbo.LetterRequest WHERE LetterRequestID = 1');
  console.log(`LetterRequest 1 Status in DB: ${letter1.recordset[0].Status} | GeneratedDocumentID: ${letter1.recordset[0].GeneratedDocumentID}`);
  if (letter1.recordset[0].Status !== 'ISSUED' || !letter1.recordset[0].GeneratedDocumentID) {
    throw new Error('Letter was not marked ISSUED or missing GeneratedDocumentID');
  }

  // Verify DocumentMaster for generated document
  const doc = await pool.request().query(
    `SELECT * FROM dbo.DocumentMaster WHERE DocumentID = ${letter1.recordset[0].GeneratedDocumentID}`,
  );
  console.log(`Document created in DocumentMaster: DocumentID=${doc.recordset[0].DocumentID}, FileName="${doc.recordset[0].FileName}", Size=${doc.recordset[0].FileSize} bytes`);
  console.log('✅ Experience Letter approved, document generated and stored, and LetterRequest marked ISSUED!');

  // Verify Audit Trail records
  console.log('\n--- Verifying Audit Trail for Executed Actions ---');
  const auditRes = await getJson('/audit?limit=10', hrToken);
  console.log(`Found ${auditRes.data.length} recent audit records.`);
  const recentActions = auditRes.data.map((a) => `${a.Action} (${a.Module}) - Record: ${a.RecordID}`);
  console.log('Recent Actions:', recentActions.slice(0, 5));

  await pool.close();
  console.log('\n=== ALL WORK QUEUE BUSINESS WORKFLOW TESTS COMPLETED AND VERIFIED! ===');
}

testWorkflows().catch((err) => {
  console.error(err);
  process.exit(1);
});
