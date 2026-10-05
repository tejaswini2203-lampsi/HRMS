const sql = require('mssql/msnodesqlv8');
const http = require('http');

const connectionString =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

const API_BASE = 'http://localhost:3000';

// Helper for HTTP requests
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function login(username, password = 'eics@4321') {
  const res = await request('POST', '/auth/login', { username, password });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login failed for ${username}: ${JSON.stringify(res.data)}`);
  }
  return res.data.accessToken;
}

async function main() {
  console.log('================================================================');
  console.log('EICS HRMS PHASE 1 — SECTION 3: FINAL INDEPENDENT VERIFICATION');
  console.log('Independent Audit across Live DB, APIs, Roles, Workflows & Builds');
  console.log('================================================================\n');

  const pool = await sql.connect({ connectionString });
  const results = [];

  // Logins
  console.log('1. Authenticating System Roles...');
  const tokens = {
    admin: await login('admin@eicscomp.com'),
    hrKsa: await login('hr.saudi@eicscomp.com'),
    hrUae: await login('hr.uae@eicscomp.com'),
    hodKsa: await login('hod.saudi@eicscomp.com'),
    empKsa: await login('employee.saudi@eicscomp.com'),
    empUae: await login('employee.uae@eicscomp.com'),
  };
  console.log('✔ Authenticated Admin, HR KSA, HR UAE, HOD KSA, Employee KSA, Employee UAE\n');

  // =========================================================================
  // CHECK 1: UAE Visa & Work Permit Pipeline Stages & Tawjeeh Branching
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 1: UAE Visa & Work Permit Pipeline Stages & Tawjeeh Branching');
  console.log('----------------------------------------------------------------');
  const uaeStages = await pool.request().query(`
    SELECT StageKey, StageName, SequenceOrder, ActorRole, DefaultSLADays, IsBusinessDays, IsConditional, BranchCondition
    FROM dbo.PipelineStageMaster
    WHERE PipelineCode = 'UAE_VISA_WORK_PERMIT'
    ORDER BY SequenceOrder ASC;
  `);

  const expectedStages = [
    'EXPIRY_DETECTED',
    'PENDING_DOCS',
    'PENDING_HOD',
    'CONTRACT_DRAFTING',
    'PENDING_SIGNATURE',
    'WPP_PAYMENT',
    'TAWJEEH',
    'WORK_PERMIT_PAYMENT',
    'MEDICAL_APP_DRAFTING',
    'PENDING_MEDICAL_TEST',
    'EMIRATES_ID_APP',
    'RESIDENCE_VISA_RENEWAL',
    'CASE_CLOSED',
  ];

  const actualStages = uaeStages.recordset.map((s) => s.StageKey);
  const allStagesPresent = expectedStages.every((s) => actualStages.includes(s));
  const tawjeehStage = uaeStages.recordset.find((s) => s.StageKey === 'TAWJEEH');
  const tawjeehConditional = tawjeehStage && tawjeehStage.IsConditional === true && tawjeehStage.BranchCondition === 'Labor';

  console.log(`UAE Pipeline Stage Count: ${actualStages.length} / 13 expected`);
  console.table(uaeStages.recordset);

  // Test Tawjeeh inclusion for Labor vs bypass for Skilled
  const uaeLaborEmp = await pool.request().query(`
    SELECT TOP 1 EmpID, UAEEmployeeCategory FROM dbo.Employee WHERE UAEEmployeeCategory = 'Labor' AND SubsidiaryID = 'uae';
  `);
  const uaeSkilledEmp = await pool.request().query(`
    SELECT TOP 1 EmpID, UAEEmployeeCategory FROM dbo.Employee WHERE UAEEmployeeCategory = 'Skilled' AND SubsidiaryID = 'uae';
  `);

  let laborTawjeehVerified = false;
  let skilledBypassVerified = false;

  if (uaeLaborEmp.recordset.length > 0 && uaeSkilledEmp.recordset.length > 0) {
    // Create Labor Case
    const laborCaseRes = await request('POST', '/compliance/cases', {
      empId: uaeLaborEmp.recordset[0].EmpID,
      eventCode: 'UAE_VISA_RENEWAL',
      priority: 'MEDIUM',
    }, tokens.hrUae);

    // Create Skilled Case
    const skilledCaseRes = await request('POST', '/compliance/cases', {
      empId: uaeSkilledEmp.recordset[0].EmpID,
      eventCode: 'UAE_VISA_RENEWAL',
      priority: 'MEDIUM',
    }, tokens.hrUae);

    if (laborCaseRes.data?.CaseID && skilledCaseRes.data?.CaseID) {
      // Check labor checklist
      const laborChk = await pool.request().query(`
        SELECT ItemKey, ItemLabel, IsCompleted FROM dbo.CaseChecklistProgress WHERE CaseID = ${laborCaseRes.data.CaseID} AND ItemKey = 'TAWJEEH_CERT';
      `);
      laborTawjeehVerified = laborChk.recordset.length > 0 && laborChk.recordset[0].IsCompleted === false;

      // Check skilled checklist
      const skilledChk = await pool.request().query(`
        SELECT ItemKey, ItemLabel, IsCompleted FROM dbo.CaseChecklistProgress WHERE CaseID = ${skilledCaseRes.data.CaseID} AND ItemKey = 'TAWJEEH_CERT';
      `);
      skilledBypassVerified = skilledChk.recordset.length > 0 && skilledChk.recordset[0].IsCompleted === true && skilledChk.recordset[0].ItemLabel.includes('(N/A');

      // Test skilled stage progression: WPP_PAYMENT -> WORK_PERMIT_PAYMENT (skipping TAWJEEH)
      await pool.request().query(`
        UPDATE dbo.ComplianceCase SET CurrentStageKey = 'WPP_PAYMENT' WHERE CaseID = ${skilledCaseRes.data.CaseID};
      `);
      const advSkilled = await request('PATCH', `/compliance/cases/${skilledCaseRes.data.CaseID}/advance`, {
        action: 'APPROVE',
        comments: 'WPP Paid for skilled employee',
      }, tokens.hrUae);
      const afterStage = await pool.request().query(`
        SELECT CurrentStageKey FROM dbo.ComplianceCase WHERE CaseID = ${skilledCaseRes.data.CaseID};
      `);
      const skilledSkippedStage = afterStage.recordset[0].CurrentStageKey === 'WORK_PERMIT_PAYMENT';

      console.log(`Labor Tawjeeh Checklist: Required = ${laborTawjeehVerified}`);
      console.log(`Skilled Tawjeeh Checklist: N/A = ${skilledBypassVerified}`);
      console.log(`Skilled Stage Advancement: Skipped TAWJEEH to WORK_PERMIT_PAYMENT = ${skilledSkippedStage}`);
    }
  }

  const check1Passed = allStagesPresent && tawjeehConditional && laborTawjeehVerified && skilledBypassVerified;
  results.push({ check: '1. UAE Visa Pipeline 13 Stages & Tawjeeh Branching', passed: check1Passed });
  console.log(`CHECK 1 RESULT: ${check1Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  // =========================================================================
  // CHECK 2: KSA Iqama Fees Configuration-Driven
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 2: KSA Iqama Fees Configuration-Driven');
  console.log('----------------------------------------------------------------');
  const iqamaConfig = await pool.request().query(`
    SELECT ConfigKey, ConfigValue, Description
    FROM dbo.SystemConfig
    WHERE ConfigKey IN ('ksaIqama12mFee', 'ksaIqama6mFee', 'ksaIqama3mFee');
  `);
  console.table(iqamaConfig.recordset);

  // Call /compliance/config to verify API returns configured fees
  const sysConfigRes = await request('GET', '/compliance/config', null, tokens.admin);
  const cfg12 = sysConfigRes.data?.ksaIqama12mFee;
  const cfg6 = sysConfigRes.data?.ksaIqama6mFee;
  const cfg3 = sysConfigRes.data?.ksaIqama3mFee;
  console.log(`API Config response: 12m = SAR ${cfg12}, 6m = SAR ${cfg6}, 3m = SAR ${cfg3}`);

  // Test dynamic fee lookup during HOD_DURATION stage advance
  const ksaEmp = await pool.request().query(`
    SELECT TOP 1 EmpID FROM dbo.Employee WHERE SubsidiaryID = 'saudi' AND IsSaudiNational = 0;
  `);
  const iqamaCaseRes = await request('POST', '/compliance/cases', {
    empId: ksaEmp.recordset[0].EmpID,
    eventCode: 'KSA_IQAMA_RENEWAL',
    priority: 'HIGH',
  }, tokens.hrKsa);

  let feeLookupMatches = false;
  if (iqamaCaseRes.data?.CaseID) {
    // Set to HOD_DURATION
    await pool.request().query(`
      UPDATE dbo.ComplianceCase SET CurrentStageKey = 'HOD_DURATION', AssignedRole = 'HOD' WHERE CaseID = ${iqamaCaseRes.data.CaseID};
    `);
    const advDuration = await request('PATCH', `/compliance/cases/${iqamaCaseRes.data.CaseID}/advance`, {
      action: 'APPROVE',
      meta: { durationMonths: 12 },
      comments: '12 months selected',
    }, tokens.admin);

    const updatedCase = await pool.request().query(`
      SELECT MetaJson FROM dbo.ComplianceCase WHERE CaseID = ${iqamaCaseRes.data.CaseID};
    `);
    const meta = JSON.parse(updatedCase.recordset[0].MetaJson);
    console.log(`Persisted Meta: Duration = ${meta.durationMonths} months, Applied Fee = SAR ${meta.applicableFee}`);
    feeLookupMatches = meta.applicableFee === cfg12 && meta.durationMonths === 12;
  }

  const check2Passed = iqamaConfig.recordset.length === 3 && cfg12 === 10350 && feeLookupMatches;
  results.push({ check: '2. KSA Iqama Fees Configuration-Driven', passed: check2Passed });
  console.log(`CHECK 2 RESULT: ${check2Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  // =========================================================================
  // CHECK 3: PassportAlertLog Records & Constraint
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 3: PassportAlertLog Records & Constraint Support');
  console.log('----------------------------------------------------------------');
  const alertCount = await pool.request().query(`SELECT COUNT(*) as total FROM dbo.PassportAlertLog;`);
  const alertBreakdown = await pool.request().query(`SELECT AlertType, COUNT(*) as count FROM dbo.PassportAlertLog GROUP BY AlertType;`);
  const alertConstraint = await pool.request().query(`
    SELECT cc.name, cc.definition
    FROM sys.check_constraints cc
    JOIN sys.tables t ON cc.parent_object_id = t.object_id
    WHERE t.name = 'PassportAlertLog';
  `);

  console.log(`Total PassportAlertLog Rows: ${alertCount.recordset[0].total}`);
  console.table(alertBreakdown.recordset);
  console.log('Check constraint:');
  console.table(alertConstraint.recordset);

  // Test insertion of both legacy and new UAE alert type in transaction
  let constraintValidationPassed = false;
  const trans = new sql.Transaction(pool);
  await trans.begin();
  try {
    const req = new sql.Request(trans);
    await req.query(`INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status) VALUES (1, '30d', SYSDATETIME(), 'test@test.com', 'Sent');`);
    await req.query(`INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status) VALUES (1, '90d', SYSDATETIME(), 'test@test.com', 'Sent');`);
    await req.query(`INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status) VALUES (1, '180d', SYSDATETIME(), 'test@test.com', 'Sent');`);
    await req.query(`INSERT INTO dbo.PassportAlertLog (PassportID, AlertType, SentDate, RecipientList, Status) VALUES (1, '210d', SYSDATETIME(), 'test@test.com', 'Sent');`);
    constraintValidationPassed = true;
    await trans.rollback();
  } catch (e) {
    await trans.rollback();
    console.error('Constraint test failed:', e);
  }

  const check3Passed = alertCount.recordset[0].total >= 23 && constraintValidationPassed;
  results.push({ check: '3. PassportAlertLog Records Preserved & Constraint Supports 30d/90d/180d/210d', passed: check3Passed });
  console.log(`CHECK 3 RESULT: ${check3Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  // =========================================================================
  // CHECK 4: KSA Exit/Re-Entry 45-day Iqama Blocking Rule
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 4: KSA Exit/Re-Entry 45-day Iqama Blocking Rule Cannot be Bypassed');
  console.log('----------------------------------------------------------------');
  // Employee with Iqama expiring in < 45 days (EmpID: 2 - Saleem has 20 days remaining)
  const expiringEmp = await pool.request().query(`
    SELECT EmpID, IqamaNumber, IqamaExpiry, DATEDIFF(day, GETDATE(), IqamaExpiry) as DaysLeft
    FROM dbo.Employee WHERE SubsidiaryID = 'saudi' AND IqamaExpiry IS NOT NULL AND DATEDIFF(day, GETDATE(), IqamaExpiry) < 45;
  `);
  console.log(`Target Non-Saudi Employee with Iqama < 45d:`);
  console.table(expiringEmp.recordset);

  // Attempt creation
  const blockedCreateRes = await request('POST', '/compliance/cases', {
    empId: expiringEmp.recordset[0].EmpID,
    eventCode: 'KSA_EXIT_REENTRY',
    priority: 'HIGH',
  }, tokens.hrKsa);

  const blockedCaseId = blockedCreateRes.data?.CaseID;
  const isCreatedBlocked = blockedCreateRes.data?.Status === 'BLOCKED';
  console.log(`Case Created: ID = ${blockedCaseId}, Status = ${blockedCreateRes.data?.Status}`);
  console.log(`Block Reason: ${blockedCreateRes.data?.BlockReason}`);

  // Attempt direct bypass via /advance API
  const bypassAttempt = await request('PATCH', `/compliance/cases/${blockedCaseId}/advance`, {
    action: 'APPROVE',
    comments: 'Attempting to bypass 45-day Iqama block',
  }, tokens.admin);

  const bypassRejected = bypassAttempt.status === 400 && bypassAttempt.data?.message?.includes('Hard blocking rule');
  console.log(`Bypass Advance Status: HTTP ${bypassAttempt.status}`);
  console.log(`Validation Message: "${bypassAttempt.data?.message}"`);

  // Test eligible case (> 45 days)
  const validEmp = await pool.request().query(`
    SELECT TOP 1 EmpID, IqamaNumber, IqamaExpiry, DATEDIFF(day, GETDATE(), IqamaExpiry) as DaysLeft,
           DATEDIFF(day, JoiningDate, GETDATE()) as TenureDays
    FROM dbo.Employee WHERE SubsidiaryID = 'saudi' AND IqamaExpiry IS NOT NULL AND DATEDIFF(day, GETDATE(), IqamaExpiry) >= 45;
  `);
  console.log(`Eligible Employee (> 45d):`);
  console.table(validEmp.recordset);

  const eligibleRes = await request('POST', '/compliance/cases', {
    empId: validEmp.recordset[0].EmpID,
    eventCode: 'KSA_EXIT_REENTRY',
    priority: 'HIGH',
  }, tokens.hrKsa);

  const eligibleMeta = JSON.parse(eligibleRes.data?.MetaJson || '{}');
  const eligiblePassed = eligibleRes.data?.Status === 'OPEN' && eligibleMeta.paymentResponsibility === 'COMPANY_PAID';
  console.log(`Eligible Case Created: ID = ${eligibleRes.data?.CaseID}, Status = ${eligibleRes.data?.Status}, Payment = ${eligibleMeta.paymentResponsibility}`);

  const check4Passed = isCreatedBlocked && bypassRejected && eligiblePassed;
  results.push({ check: '4. KSA Exit/Re-Entry 45-day Iqama Blocking Rule & Bypass Prevention', passed: check4Passed });
  console.log(`CHECK 4 RESULT: ${check4Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  // =========================================================================
  // CHECK 5: Compliance Case Closure Validation (Checklist Enforcement)
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 5: Compliance Case Closure Cannot Occur with Pending Checklist Items');
  console.log('----------------------------------------------------------------');
  // Create a fresh UAE case
  const testCloseCase = await request('POST', '/compliance/cases', {
    empId: uaeSkilledEmp.recordset[0].EmpID,
    eventCode: 'UAE_VISA_RENEWAL',
    priority: 'HIGH',
  }, tokens.hrUae);
  const testCaseId = testCloseCase.data?.CaseID;

  // Move case to penultimate stage (RESIDENCE_VISA_RENEWAL)
  await pool.request().query(`
    UPDATE dbo.ComplianceCase SET CurrentStageKey = 'RESIDENCE_VISA_RENEWAL' WHERE CaseID = ${testCaseId};
  `);

  // Attempt closure when checklist items are pending
  const prematureClose = await request('PATCH', `/compliance/cases/${testCaseId}/advance`, {
    action: 'APPROVE',
    comments: 'Attempting to close with incomplete checklist',
  }, tokens.hrUae);

  const closureBlockedProperly = prematureClose.status === 400 && prematureClose.data?.message?.includes('Required checklist items pending');
  console.log(`Premature Closure Status: HTTP ${prematureClose.status}`);
  console.log(`Block Message: "${prematureClose.data?.message}"`);

  // Complete all items in checklist
  await pool.request().query(`
    UPDATE dbo.CaseChecklistProgress SET IsCompleted = 1, CompletedAt = SYSDATETIME() WHERE CaseID = ${testCaseId};
  `);

  // Re-attempt closure
  const validClose = await request('PATCH', `/compliance/cases/${testCaseId}/advance`, {
    action: 'APPROVE',
    comments: 'All checklist items verified and complete',
  }, tokens.hrUae);

  const caseAfterClose = await pool.request().query(`
    SELECT Status, CurrentStageKey, ClosedAt FROM dbo.ComplianceCase WHERE CaseID = ${testCaseId};
  `);
  const closureSucceeded = caseAfterClose.recordset[0].Status === 'COMPLETED' && caseAfterClose.recordset[0].CurrentStageKey === 'CASE_CLOSED';
  console.log(`After completing checklist, Closure Status: ${caseAfterClose.recordset[0].Status}, Stage: ${caseAfterClose.recordset[0].CurrentStageKey}`);

  const check5Passed = closureBlockedProperly && closureSucceeded;
  results.push({ check: '5. Compliance Case Closure Blocked with Pending Checklist & Succeeds when Complete', passed: check5Passed });
  console.log(`CHECK 5 RESULT: ${check5Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  // =========================================================================
  // CHECK 6: Role-Based Access for Admin, HR KSA, HR UAE, HOD, and Employee
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 6: Role-Based Access Control (Admin, HR KSA, HR UAE, HOD, Employee)');
  console.log('----------------------------------------------------------------');
  const getCasesList = (res) => (Array.isArray(res.data) ? res.data : res.data?.data || []);

  // 1. Employee Saleem (EmpID: 2) fetching cases
  const empSaleemCases = await request('GET', '/compliance/cases', null, tokens.empUae);
  const empSaleemList = getCasesList(empSaleemCases);
  const onlySaleemCases = empSaleemList.length > 0 && empSaleemList.every((c) => c.EmpID === 2);
  console.log(`Employee Saleem (EmpID 2) sees only his own cases: ${onlySaleemCases} (Count: ${empSaleemList.length})`);

  // 2. Employee Saleem attempting to access Rahul's case (EmpID: 18) directly
  const rahulCase = await pool.request().query(`SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 18;`);
  let employeeIsolationPassed = false;
  if (rahulCase.recordset.length > 0) {
    const unauthorizedAccess = await request('GET', `/compliance/cases/${rahulCase.recordset[0].CaseID}`, null, tokens.empUae);
    employeeIsolationPassed = unauthorizedAccess.status === 403;
    console.log(`Employee accessing another employee's case: HTTP ${unauthorizedAccess.status} (403 expected)`);
  }

  // 3. HOD KSA accessing unrelated UAE case
  const uaeCase = await pool.request().query(`SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE RegionCode = 'UAE';`);
  let hodIsolationPassed = false;
  if (uaeCase.recordset.length > 0) {
    const hodAccess = await request('GET', `/compliance/cases/${uaeCase.recordset[0].CaseID}`, null, tokens.hodKsa);
    hodIsolationPassed = hodAccess.status === 403;
    console.log(`HOD KSA accessing unrelated UAE case: HTTP ${hodAccess.status} (403 expected)`);
  }

  // 4. HR KSA vs HR UAE region scope
  const hrKsaCases = await request('GET', '/compliance/cases', null, tokens.hrKsa);
  const hrUaeCases = await request('GET', '/compliance/cases', null, tokens.hrUae);
  const hrKsaList = getCasesList(hrKsaCases);
  const hrUaeList = getCasesList(hrUaeCases);
  const isKsaRegion = (r) => r === 'saudi' || r === 'KSA';
  const isUaeRegion = (r) => r === 'uae' || r === 'UAE';

  const hrKsaOnlyKsa = hrKsaList.length > 0 && hrKsaList.every((c) => isKsaRegion(c.RegionCode));
  const hrUaeOnlyUae = hrUaeList.length > 0 && hrUaeList.every((c) => isUaeRegion(c.RegionCode));
  console.log(`HR KSA scoped strictly to KSA: ${hrKsaOnlyKsa} (Count: ${hrKsaList.length})`);
  if (!hrKsaOnlyKsa) {
    const nonKsa = hrKsaList.filter(c => !isKsaRegion(c.RegionCode));
    console.log('Non-KSA cases returned to HR KSA:', nonKsa.map(c => ({ CaseID: c.CaseID, RegionCode: c.RegionCode })));
  }
  console.log(`HR UAE scoped strictly to UAE: ${hrUaeOnlyUae} (Count: ${hrUaeList.length})`);

  // Cross-region access test for HR
  let hrCrossRegionBlocked = false;
  if (hrUaeList.length > 0) {
    const crossAccess = await request('GET', `/compliance/cases/${hrUaeList[0].CaseID}`, null, tokens.hrKsa);
    hrCrossRegionBlocked = crossAccess.status === 403;
    console.log(`HR KSA accessing UAE case directly: HTTP ${crossAccess.status} (403 expected)`);
  }

  // 5. Admin global access
  const adminCases = await request('GET', '/compliance/cases', null, tokens.admin);
  const adminList = getCasesList(adminCases);
  const adminHasBoth = adminList.some((c) => isKsaRegion(c.RegionCode)) && adminList.some((c) => isUaeRegion(c.RegionCode));
  console.log(`Admin sees both KSA and UAE cases: ${adminHasBoth} (Count: ${adminList.length})`);

  const check6Passed = onlySaleemCases && employeeIsolationPassed && hodIsolationPassed && hrKsaOnlyKsa && hrUaeOnlyUae && hrCrossRegionBlocked && adminHasBoth;
  results.push({ check: '6. Role-Based Access Isolation (Admin, HR KSA, HR UAE, HOD, Employee)', passed: check6Passed });
  console.log(`CHECK 6 RESULT: ${check6Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  // =========================================================================
  // CHECK 7: Existing EICS Modules & Section 2/2A Regression
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 7: Existing EICS Modules & Section 2/2A Regression');
  console.log('----------------------------------------------------------------');
  const empRes = await request('GET', '/employees', null, tokens.admin);
  const leaveRes = await request('GET', '/leaves', null, tokens.admin);
  const passAlertsRes = await request('GET', '/passports/alerts', null, tokens.admin);
  const passEmpRes = await request('GET', '/passports/2', null, tokens.admin);
  const vehRes = await request('GET', '/vehicle-allocations/2', null, tokens.admin);
  const fltRes = await request('GET', '/flight-tickets/2', null, tokens.admin);
  const docRes = await request('GET', '/documents', null, tokens.admin);
  const wqRes = await request('GET', '/work-queue/tasks', null, tokens.admin);

  console.log(`1. Employees API: HTTP ${empRes.status} (Records: ${Array.isArray(empRes.data) ? empRes.data.length : empRes.data?.data?.length || 0})`);
  console.log(`2. Leaves API: HTTP ${leaveRes.status} (Records: ${Array.isArray(leaveRes.data) ? leaveRes.data.length : leaveRes.data?.data?.length || 0})`);
  console.log(`3. Passports API: HTTP ${passAlertsRes.status} (Alerts: ${passAlertsRes.data?.length || 0}, Emp 2: HTTP ${passEmpRes.status})`);
  console.log(`4. Vehicles API: HTTP ${vehRes.status} (Emp 2: ${Array.isArray(vehRes.data) ? vehRes.data.length : 'OK'})`);
  console.log(`5. Flights API: HTTP ${fltRes.status} (Emp 2: ${Array.isArray(fltRes.data) ? fltRes.data.length : 'OK'})`);
  console.log(`6. Document Center API: HTTP ${docRes.status} (Records: ${Array.isArray(docRes.data) ? docRes.data.length : docRes.data?.data?.length || 0})`);
  console.log(`7. Work Queue API: HTTP ${wqRes.status} (Records: ${Array.isArray(wqRes.data) ? wqRes.data.length : wqRes.data?.tasks?.length || 0})`);

  const check7Passed = [empRes, leaveRes, passAlertsRes, passEmpRes, vehRes, fltRes, docRes, wqRes].every((r) => r.status === 200);
  results.push({ check: '7. Existing EICS Modules (Employee, Leave, Passport, Vehicle, Flight, Document, WorkQueue)', passed: check7Passed });
  console.log(`CHECK 7 RESULT: ${check7Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  // =========================================================================
  // CHECK 8: Expiry Scanner Duplicate Prevention
  // =========================================================================
  console.log('----------------------------------------------------------------');
  console.log('CHECK 8: Expiry Scanner Duplicate Prevention (Cases & Alerts)');
  console.log('----------------------------------------------------------------');
  // First scan
  const scan1 = await request('POST', '/compliance/scan', null, tokens.admin);
  const countCases1 = await pool.request().query(`SELECT COUNT(*) as total FROM dbo.ComplianceCase;`);
  const countAlerts1 = await pool.request().query(`SELECT COUNT(*) as total FROM dbo.PassportAlertLog;`);

  // Second scan immediately after
  const scan2 = await request('POST', '/compliance/scan', null, tokens.admin);
  const countCases2 = await pool.request().query(`SELECT COUNT(*) as total FROM dbo.ComplianceCase;`);
  const countAlerts2 = await pool.request().query(`SELECT COUNT(*) as total FROM dbo.PassportAlertLog;`);

  console.log(`Cases Before Scan 2: ${countCases1.recordset[0].total}, After Scan 2: ${countCases2.recordset[0].total}`);
  console.log(`Alerts Before Scan 2: ${countAlerts1.recordset[0].total}, After Scan 2: ${countAlerts2.recordset[0].total}`);

  const noDuplicateCases = countCases1.recordset[0].total === countCases2.recordset[0].total;
  const noDuplicateAlerts = countAlerts1.recordset[0].total === countAlerts2.recordset[0].total;

  const check8Passed = noDuplicateCases && noDuplicateAlerts;
  results.push({ check: '8. Expiry Scanner Duplicate Prevention (Zero Duplicates on Re-Scan)', passed: check8Passed });
  console.log(`CHECK 8 RESULT: ${check8Passed ? 'PASSED ✅' : 'FAILED ❌'}\n`);

  await pool.close();

  // Print Summary Table
  console.log('================================================================');
  console.log('INDEPENDENT VERIFICATION SUMMARY');
  console.log('================================================================');
  console.table(results);
  const allPassed = results.every((r) => r.passed);
  console.log(`ALL AUDIT CHECKS PASSED: ${allPassed ? 'YES ✅' : 'NO ❌'}`);
  console.log('================================================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
