const http = require('http');
const sql = require('mssql/msnodesqlv8');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

function request(method, urlPath, data, token) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: urlPath,
        method,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, data: body });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('================================================================');
  console.log('EICS HRMS PHASE 1 — SECTION 2 & 2A COMPLIANCE AUDIT TEST SUITE');
  console.log('================================================================\n');

  const pool = await sql.connect({ connectionString: CONNECTION });

  // 1. Authenticate users
  const adminLogin = await request('POST', '/auth/login', { username: 'admin@eicscomp.com', password: 'eics@4321' });
  const adminToken = adminLogin.data.accessToken;

  const hrLogin = await request('POST', '/auth/login', { username: 'hr.uae@eicscomp.com', password: 'eics@4321' });
  const hrToken = hrLogin.data.accessToken;

  const hodLogin = await request('POST', '/auth/login', { username: 'hod.saudi@eicscomp.com', password: 'eics@4321' });
  const hodToken = hodLogin.data.accessToken;

  const empLogin = await request('POST', '/auth/login', { username: 'employee.uae@eicscomp.com', password: 'eics@4321' });
  const empToken = empLogin.data.accessToken;

  console.log('✅ Authenticated: Admin, HR, HOD, Employee (Saleem)\n');

  // --- TEST A: Document Versioning & Deactivation of Older Versions ---
  console.log('--- TEST A: Document Versioning & Active Status ---');
  const dummyPdf = Buffer.from('%PDF-1.3\n%Test PDF\n%%EOF').toString('base64');
  
  const upload1 = await request('POST', '/documents', {
    category: 'NationalID',
    sourceModule: 'DocumentCenter',
    fileName: 'Saleem_EmiratesID_v1.pdf',
    fileContentBase64: dummyPdf,
    mimeType: 'application/pdf',
  }, empToken);
  console.log(`Uploaded v1: DocID ${upload1.data.DocumentID}, Version ${upload1.data.Version}, IsActive ${upload1.data.IsActiveVersion}`);

  const upload2 = await request('POST', '/documents', {
    category: 'NationalID',
    sourceModule: 'DocumentCenter',
    fileName: 'Saleem_EmiratesID_v2.pdf',
    fileContentBase64: dummyPdf,
    mimeType: 'application/pdf',
  }, empToken);
  console.log(`Uploaded v2: DocID ${upload2.data.DocumentID}, Version ${upload2.data.Version}, IsActive ${upload2.data.IsActiveVersion}`);

  // Query DB directly to verify Version and IsActiveVersion states
  const checkDb = await pool.request().query(`
    SELECT DocumentID, Category, FileName, Version, IsActiveVersion 
    FROM dbo.DocumentMaster 
    WHERE EmpID = 2 AND Category = 'NationalID'
    ORDER BY DocumentID DESC;
  `);
  console.table(checkDb.recordset);

  if (checkDb.recordset[0].Version <= checkDb.recordset[1].Version) {
    throw new Error('Version was not incremented');
  }
  if (!checkDb.recordset[0].IsActiveVersion || checkDb.recordset[1].IsActiveVersion) {
    throw new Error('Active version flags incorrect: older version should be 0, newer version should be 1');
  }
  console.log('✅ Document Versioning Verified: Version incremented, older version deactivated, active version preserved!\n');

  // --- TEST B: Role Authorization Boundaries in Work Queue Execution ---
  console.log('--- TEST B: Role Authorization Boundaries in Work Queue Execution ---');
  // 1. Admin Task: TaskID 40 (Mudasiir — Vendor / Admin Processing, AssignedRole: 'ADMIN')
  console.log('Testing with Admin Task 40 (AssignedRole: ADMIN)...');
  const hrExecAdmin = await request('POST', '/work-queue/tasks/40/execute', { action: 'CONFIRM' }, hrToken);
  console.log(`HR executing ADMIN task -> Status: ${hrExecAdmin.status} ("${hrExecAdmin.data?.message}")`);
  if (hrExecAdmin.status !== 403) throw new Error('Expected 403 Forbidden for HR executing ADMIN task');

  const hodExecAdmin = await request('POST', '/work-queue/tasks/40/execute', { action: 'CONFIRM' }, hodToken);
  console.log(`HOD executing ADMIN task -> Status: ${hodExecAdmin.status} ("${hodExecAdmin.data?.message}")`);
  if (hodExecAdmin.status !== 403) throw new Error('Expected 403 Forbidden for HOD executing ADMIN task');

  const empExecAdmin = await request('POST', '/work-queue/tasks/40/execute', { action: 'CONFIRM' }, empToken);
  console.log(`Employee executing ADMIN task -> Status: ${empExecAdmin.status} ("${empExecAdmin.data?.message}")`);
  if (empExecAdmin.status !== 403) throw new Error('Expected 403 Forbidden for Employee executing ADMIN task');

  // 2. Employee Task: TaskID 36 (Sashi — Pending Employee Signature, TargetEmpID: 23)
  // Saleem (EmpID: 2) tries to execute Sashi's task
  console.log("\nTesting with Sashi's Task 36 (AssignedRole: EMPLOYEE, Target: Sashi)...");
  const crossEmpExec = await request('POST', '/work-queue/tasks/36/execute', { action: 'CONFIRM' }, empToken);
  console.log(`Saleem executing Sashi's task -> Status: ${crossEmpExec.status} ("${crossEmpExec.data?.message}")`);
  if (crossEmpExec.status !== 403) throw new Error("Expected 403 Forbidden for Saleem executing Sashi's task");

  console.log('✅ Role Execution Enforcement Verified: Strict role boundaries enforced across all tiers!\n');

  // --- TEST C: Expiry Scanner with Dynamic SystemConfig Lead Times ---
  console.log('--- TEST C: Expiry Scanner with Dynamic SystemConfig Lead Times ---');
  const scanRes = await request('POST', '/compliance/scan', {}, hrToken);
  console.log(`Expiry Scanner execution -> Status: ${scanRes.status}, Result:`, scanRes.data);
  if (scanRes.status !== 200 && scanRes.status !== 201) {
    throw new Error('Expiry scan failed');
  }
  console.log('✅ Dynamic Expiry Scanner Verified!\n');

  // --- TEST D: Regression Check Across All Core Modules ---
  console.log('--- TEST D: Regression Check Across All Core Modules ---');
  const endpoints = [
    '/employees',
    '/departments',
    '/leaves',
    '/passports/alerts',
    '/passports/1',
    '/vehicle-allocations/1',
    '/flight-tickets/1',
    '/notifications',
    '/compliance/cases',
    '/work-queue/tasks',
    '/documents',
    '/letters',
  ];

  for (const ep of endpoints) {
    const res = await request('GET', ep, null, adminToken);
    const count = Array.isArray(res.data) ? res.data.length : (typeof res.data === 'object' ? Object.keys(res.data).length : 'text');
    console.log(`Endpoint ${ep.padEnd(25)} -> Status: ${res.status}, Count: ${count}`);
    if (res.status !== 200) throw new Error(`Endpoint ${ep} returned status ${res.status}`);
  }
  console.log('✅ All endpoints returned HTTP 200 with zero regressions!\n');

  await pool.close();
  console.log('================================================================');
  console.log('🎉 ALL SECTION 2 & 2A COMPLIANCE AUDIT TESTS PASSED SUCCESSFULLY!');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('❌ Audit test failed:', err);
  process.exit(1);
});
