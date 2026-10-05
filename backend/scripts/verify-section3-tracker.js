const sql = require('mssql/msnodesqlv8');

const BASE_URL = 'http://localhost:3000';
const DB_CONN =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

async function login(username, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed for ${username}: ${res.status} ${err}`);
  }
  const data = await res.json();
  return { token: data.accessToken, user: data.user };
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (e) {
    json = text;
  }
  return { status: res.status, ok: res.ok, data: json };
}

const testResults = [];
function recordResult(num, title, passed, details) {
  testResults.push({ num, title, passed, details });
  console.log(`${passed ? '✅' : '❌'} Scenario ${num}: ${title}`);
  if (details) console.log(`   ${details}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('EICS HRMS PHASE 1 — SECTION 3: EMPLOYEE COMPLIANCE TRACKER');
  console.log('Automated Verification of Mandatory 19 Scenarios (Section 17)');
  console.log('================================================================\n');

  const pool = await sql.connect({ connectionString: DB_CONN });

  // Authenticate users
  const adminAuth = await login('admin@eicscomp.com', 'eics@4321');
  const hrSaudiAuth = await login('hr.saudi@eicscomp.com', 'eics@4321');
  const hrUaeAuth = await login('hr.uae@eicscomp.com', 'eics@4321');
  const hodSaudiAuth = await login('hod.saudi@eicscomp.com', 'eics@4321');
  const empSaleemAuth = await login('employee.uae@eicscomp.com', 'eics@4321'); // EmpID: 2 (UAE Skilled/Manager)
  const empMudasiirAuth = await login('employee.saudi@eicscomp.com', 'eics@4321'); // EmpID: 3 (Saudi Non-national)

  console.log('Authenticated all test roles: Admin, HR Saudi, HR UAE, HOD Saudi, Employee UAE, Employee Saudi\n');

  // -------------------------------------------------------------------------
  // Scenario 1: KSA fixed-term contract renewal reaches HOD at configured lead time (75d)
  // -------------------------------------------------------------------------
  try {
    // Set employee 18 (Rahul Kumar) contract expiry to 70 days from now (within 75d lead time)
    await pool.request().query(`
      UPDATE dbo.Employee
      SET ContractExpiry = DATEADD(day, 70, CAST(GETDATE() AS DATE)),
          ContractRenewalCount = 1,
          IsSaudiNational = 0,
          SubsidiaryID = 'saudi',
          ReportsToEmpID = 24
      WHERE EmpID = 18;

      DELETE FROM dbo.CaseChecklistProgress WHERE CaseID IN (SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = 18 AND EventCode = 'KSA_CONTRACT_RENEWAL');
      DELETE FROM dbo.CaseStageHistory WHERE CaseID IN (SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = 18 AND EventCode = 'KSA_CONTRACT_RENEWAL');
      DELETE FROM dbo.WorkQueueTask WHERE TargetEmpID = 18 AND SourceModule = 'Compliance';
      DELETE FROM dbo.ComplianceCase WHERE EmpID = 18 AND EventCode = 'KSA_CONTRACT_RENEWAL';
    `);

    // Run scanner
    const scanRes = await api('/compliance/scan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });

    const caseCheck = await pool.request().query(`
      SELECT CaseID, CaseNumber, EventCode, CurrentStageKey, AssignedRole, DueDate
      FROM dbo.ComplianceCase
      WHERE EmpID = 18 AND EventCode = 'KSA_CONTRACT_RENEWAL';
    `);

    const cId = caseCheck.recordset[0]?.CaseID;
    // HR initiates and transitions to HOD
    const hrInitRes = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'HR verified contract expiry, advancing to HOD' }),
    });

    const hodStageCheck = await pool.request().query(`
      SELECT CurrentStageKey, AssignedRole FROM dbo.ComplianceCase WHERE CaseID = ${cId};
    `);

    const reachedHod =
      hodStageCheck.recordset[0]?.CurrentStageKey === 'HOD_CONFIRMATION' &&
      hodStageCheck.recordset[0]?.AssignedRole === 'HOD';

    const passed = caseCheck.recordset.length > 0 && scanRes.ok && hrInitRes.ok && reachedHod;
    recordResult(
      1,
      'KSA fixed-term contract renewal reaches HOD at configured lead time',
      passed,
      `Case ${caseCheck.recordset[0]?.CaseNumber} triggered at 75d. HR initiated -> Stage: ${hodStageCheck.recordset[0]?.CurrentStageKey}, Role: ${hodStageCheck.recordset[0]?.AssignedRole}`,
    );
  } catch (err) {
    recordResult(1, 'KSA fixed-term contract renewal reaches HOD at configured lead time', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 2: HOD renewal decision is persisted
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID, CurrentStageKey FROM dbo.ComplianceCase WHERE EmpID = 18 AND EventCode = 'KSA_CONTRACT_RENEWAL' ORDER BY CaseID DESC;
    `);
    const cId = caseRow.recordset[0].CaseID;

    // HOD confirms renewal
    const hodAdvance = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hodSaudiAuth.token}` },
      body: JSON.stringify({ action: 'CONFIRM_RENEWAL', comments: 'HOD approved contract renewal for 1 year' }),
    });

    // Verify history in DB
    const historyCheck = await pool.request().query(`
      SELECT * FROM dbo.CaseStageHistory WHERE CaseID = ${cId} AND StageKey = 'HOD_CONFIRMATION';
    `);

    const passed = hodAdvance.ok && historyCheck.recordset.length > 0 && historyCheck.recordset[0].Comments.includes('HOD approved');
    recordResult(
      2,
      'HOD renewal decision is persisted',
      passed,
      `Action: ${historyCheck.recordset[0]?.ActionTaken}, Comments: "${historyCheck.recordset[0]?.Comments}"`,
    );
  } catch (err) {
    recordResult(2, 'HOD renewal decision is persisted', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 3: Admin/Ajeer routing follows configured vendor
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 18 AND EventCode = 'KSA_CONTRACT_RENEWAL' ORDER BY CaseID DESC;
    `);
    const cId = caseRow.recordset[0].CaseID;

    // Advance ADMIN_AJEER stage selecting vendor AJEER_VENDOR_1 (Tamkeen, SLA 5 days)
    const vendorAdvance = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
      body: JSON.stringify({
        action: 'APPROVE',
        comments: 'Routed via configured vendor Tamkeen',
        meta: { vendorId: 'AJEER_VENDOR_1' },
      }),
    });

    const metaCheck = await pool.request().query(`
      SELECT MetaJson, DueDate FROM dbo.ComplianceCase WHERE CaseID = ${cId};
    `);
    const meta = JSON.parse(metaCheck.recordset[0].MetaJson || '{}');

    const passed = vendorAdvance.ok && meta.vendor && meta.vendor.id === 'AJEER_VENDOR_1' && meta.vendor.slaDays === 5;
    recordResult(
      3,
      'Admin/Ajeer routing follows configured vendor',
      passed,
      `Vendor routed: ${meta.vendor?.name}, SLA Days: ${meta.vendor?.slaDays}, Routing: ${meta.vendor?.routing}`,
    );
  } catch (err) {
    recordResult(3, 'Admin/Ajeer routing follows configured vendor', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Iqama duration accepts only 3, 6, or 12 months
  // -------------------------------------------------------------------------
  try {
    const newIqamaCase = await api('/compliance/cases', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({
        empId: 3,
        regionCode: 'saudi',
        eventCode: 'KSA_IQAMA_RENEWAL',
        pipelineCode: 'KSA_IQAMA',
      }),
    });
    const iqamaCaseId = newIqamaCase.data.CaseID;

    // Advance to HOD_DURATION stage
    await api(`/compliance/cases/${iqamaCaseId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'Expiry confirmed' }),
    });

    // Try submitting invalid duration: 5 months
    const invalidRes = await api(`/compliance/cases/${iqamaCaseId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hodSaudiAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', meta: { durationMonths: 5 } }),
    });

    const passed = invalidRes.status === 400 && invalidRes.data.message.includes('3, 6, or 12 months');
    recordResult(
      4,
      'Iqama duration accepts only 3, 6, or 12 months',
      passed,
      `Invalid duration (5 months) rejected with HTTP ${invalidRes.status}: "${invalidRes.data.message}"`,
    );
  } catch (err) {
    recordResult(4, 'Iqama duration accepts only 3, 6, or 12 months', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 5: Iqama fee is read from configuration
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 3 AND EventCode = 'KSA_IQAMA_RENEWAL' AND CurrentStageKey = 'HOD_DURATION' ORDER BY CaseID DESC;
    `);
    const cId = caseRow.recordset[0].CaseID;

    // Advance with duration = 12 months
    const advance12m = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hodSaudiAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', meta: { durationMonths: 12 } }),
    });

    const metaCheck = await pool.request().query(`
      SELECT MetaJson FROM dbo.ComplianceCase WHERE CaseID = ${cId};
    `);
    const meta = JSON.parse(metaCheck.recordset[0].MetaJson || '{}');

    const passed = advance12m.ok && meta.applicableFee === 10350 && meta.durationMonths === 12;
    recordResult(
      5,
      'Iqama fee is read from configuration',
      passed,
      `Duration: 12 months -> Fee read from SystemConfig: SAR ${meta.applicableFee} (Currency: ${meta.feeCurrency})`,
    );
  } catch (err) {
    recordResult(5, 'Iqama fee is read from configuration', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 6: Finance payment does not automatically bypass remaining required stages
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 3 AND EventCode = 'KSA_IQAMA_RENEWAL' ORDER BY CaseID DESC;
    `);
    const cId = caseRow.recordset[0].CaseID;

    // Advance from VENDOR_ADMIN to FINANCE_PAYMENT
    await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'Vendor invoice processed' }),
    });

    // At FINANCE_PAYMENT: advance with payment recorded
    const financeAdvance = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'SAR 10,350 payment disbursed via corporate account' }),
    });

    // Check case status: must move to CASE_CLOSED (final confirmation stage), NOT completed automatically
    const caseCheck = await pool.request().query(`
      SELECT CurrentStageKey, Status FROM dbo.ComplianceCase WHERE CaseID = ${cId};
    `);
    const stage = caseCheck.recordset[0].CurrentStageKey;

    const passed = financeAdvance.ok && stage === 'CASE_CLOSED';
    recordResult(
      6,
      'Finance payment does not automatically bypass remaining required stages',
      passed,
      `Payment recorded. Stage moved to ${stage} (Awaiting final issuance/closure confirmation)`,
    );
  } catch (err) {
    recordResult(6, 'Finance payment does not automatically bypass remaining required stages', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 7: Exit/Re-Entry is blocked when Iqama expires within 45 days
  // -------------------------------------------------------------------------
  try {
    await pool.request().query(`
      UPDATE dbo.Employee
      SET IqamaExpiry = DATEADD(day, 20, CAST(GETDATE() AS DATE))
      WHERE EmpID = 3;
    `);

    const createRes = await api('/compliance/cases', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({
        empId: 3,
        regionCode: 'saudi',
        eventCode: 'KSA_EXIT_REENTRY',
        pipelineCode: 'KSA_EXIT_REENTRY_PIPE',
      }),
    });

    const blockedExitCaseId = createRes.data.CaseID;
    const isBlocked = createRes.data.Status === 'BLOCKED' && createRes.data.BlockReason.includes('within 45 days');

    const advanceBlocked = await api(`/compliance/cases/${blockedExitCaseId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'Attempting to advance blocked case' }),
    });

    const advancePrevented = advanceBlocked.status === 400 && advanceBlocked.data.message.includes('Hard blocking rule');

    const depCheck = await pool.request().query(`
      SELECT * FROM dbo.CaseDependency WHERE CaseID = ${blockedExitCaseId} AND DependencyType = 'IQAMA_VALIDITY';
    `);
    const depBlocked = depCheck.recordset.length > 0 && depCheck.recordset[0].Status === 'BLOCKED';

    const passed = isBlocked && advancePrevented && depBlocked;
    recordResult(
      7,
      'Exit/Re-Entry is blocked when Iqama expires within 45 days',
      passed,
      `Case Status: ${createRes.data.Status}, BlockReason: "${createRes.data.BlockReason}". Advance HTTP ${advanceBlocked.status}: "${advanceBlocked.data.message}"`,
    );
  } catch (err) {
    recordResult(7, 'Exit/Re-Entry is blocked when Iqama expires within 45 days', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 8: Eligible Exit/Re-Entry can proceed
  // -------------------------------------------------------------------------
  try {
    await pool.request().query(`
      UPDATE dbo.Employee
      SET IqamaExpiry = DATEADD(day, 120, CAST(GETDATE() AS DATE)),
          JoiningDate = '2022-04-12'
      WHERE EmpID = 18;
    `);

    const createRes = await api('/compliance/cases', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({
        empId: 18,
        regionCode: 'saudi',
        eventCode: 'KSA_EXIT_REENTRY',
        pipelineCode: 'KSA_EXIT_REENTRY_PIPE',
      }),
    });

    const cId = createRes.data.CaseID;
    const meta = JSON.parse(createRes.data.MetaJson || '{}');
    const isEligible = createRes.data.Status === 'OPEN' && !createRes.data.BlockReason;
    const isCompanyPaid = meta.paymentResponsibility === 'COMPANY_PAID';

    const advanceRes = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrSaudiAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'Travel verified and Iqama valid' }),
    });

    const passed = isEligible && isCompanyPaid && advanceRes.ok;
    recordResult(
      8,
      'Eligible Exit/Re-Entry can proceed',
      passed,
      `Case ${createRes.data.CaseNumber} OPEN. Payment: ${meta.paymentResponsibility} (${meta.paymentRuleNote}). Advance succeeded: ${advanceRes.ok}`,
    );
  } catch (err) {
    recordResult(8, 'Eligible Exit/Re-Entry can proceed', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 9: UAE Labor includes Tawjeeh
  // -------------------------------------------------------------------------
  try {
    await pool.request().query(`
      UPDATE dbo.Employee
      SET SubsidiaryID = 'uae', UAEEmployeeCategory = 'Labor'
      WHERE EmpID = 21;
    `);

    const createLaborCase = await api('/compliance/cases', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrUaeAuth.token}` },
      body: JSON.stringify({
        empId: 21,
        regionCode: 'uae',
        eventCode: 'UAE_VISA_RENEWAL',
        pipelineCode: 'UAE_VISA_WORK_PERMIT',
      }),
    });

    const cId = createLaborCase.data.CaseID;

    const checklist = await pool.request().query(`
      SELECT * FROM dbo.CaseChecklistProgress WHERE CaseID = ${cId} AND ItemKey = 'TAWJEEH_CERT';
    `);

    const tawjeehItem = checklist.recordset[0];
    const passed = tawjeehItem && tawjeehItem.IsCompleted === false && !tawjeehItem.ItemLabel.includes('N/A');
    recordResult(
      9,
      'UAE Labor includes Tawjeeh',
      passed,
      `Tawjeeh checklist item present for Labor employee: "${tawjeehItem?.ItemLabel}", IsCompleted: ${tawjeehItem?.IsCompleted}`,
    );
  } catch (err) {
    recordResult(9, 'UAE Labor includes Tawjeeh', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 10: UAE Skilled skips Tawjeeh
  // -------------------------------------------------------------------------
  try {
    await pool.request().query(`
      UPDATE dbo.Employee
      SET SubsidiaryID = 'uae', UAEEmployeeCategory = 'Skilled'
      WHERE EmpID = 2;
    `);

    const createSkilledCase = await api('/compliance/cases', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hrUaeAuth.token}` },
      body: JSON.stringify({
        empId: 2,
        regionCode: 'uae',
        eventCode: 'UAE_VISA_RENEWAL',
        pipelineCode: 'UAE_VISA_WORK_PERMIT',
      }),
    });

    const cId = createSkilledCase.data.CaseID;

    const checklist = await pool.request().query(`
      SELECT * FROM dbo.CaseChecklistProgress WHERE CaseID = ${cId} AND ItemKey = 'TAWJEEH_CERT';
    `);
    const tawjeehItem = checklist.recordset[0];

    // Advance to WPP_PAYMENT to verify skipping TAWJEEH -> WORK_PERMIT_PAYMENT
    await pool.request().query(`
      UPDATE dbo.ComplianceCase
      SET CurrentStageKey = 'WPP_PAYMENT'
      WHERE CaseID = ${cId};
    `);

    const branchAdvance = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrUaeAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'WPP Payment completed' }),
    });

    const newStage = branchAdvance.data.newStage;
    const passed =
      tawjeehItem &&
      tawjeehItem.IsCompleted === true &&
      tawjeehItem.ItemLabel.includes('N/A') &&
      newStage === 'WORK_PERMIT_PAYMENT';
    recordResult(
      10,
      'UAE Skilled skips Tawjeeh',
      passed,
      `Skilled checklist: "${tawjeehItem?.ItemLabel}". Advance from WPP_PAYMENT skipped TAWJEEH -> ${newStage}`,
    );
  } catch (err) {
    recordResult(10, 'UAE Skilled skips Tawjeeh', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 11: Standard UAE trigger uses configured 90-day lead time
  // -------------------------------------------------------------------------
  try {
    await pool.request().query(`
      UPDATE dbo.Employee
      SET SubsidiaryID = 'uae',
          UAEEmployeeCategory = 'Standard',
          VisaExpiry = DATEADD(day, 85, CAST(GETDATE() AS DATE))
      WHERE EmpID = 17;

      DELETE FROM dbo.CaseChecklistProgress WHERE CaseID IN (SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = 17 AND EventCode = 'UAE_VISA_RENEWAL');
      DELETE FROM dbo.CaseStageHistory WHERE CaseID IN (SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = 17 AND EventCode = 'UAE_VISA_RENEWAL');
      DELETE FROM dbo.WorkQueueTask WHERE TargetEmpID = 17 AND SourceModule = 'Compliance';
      DELETE FROM dbo.ComplianceCase WHERE EmpID = 17 AND EventCode = 'UAE_VISA_RENEWAL';
    `);

    const scanRes = await api('/compliance/scan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });

    const caseCheck = await pool.request().query(`
      SELECT CaseID, CaseNumber, EventCode, CurrentStageKey FROM dbo.ComplianceCase WHERE EmpID = 17 AND EventCode = 'UAE_VISA_RENEWAL' ORDER BY CaseID DESC;
    `);

    const passed = scanRes.ok && caseCheck.recordset.length > 0;
    recordResult(
      11,
      'Standard UAE trigger uses configured 90-day lead time',
      passed,
      `Expiry in 85 days detected under 90-day standard rule -> Case ${caseCheck.recordset[0]?.CaseNumber} created`,
    );
  } catch (err) {
    recordResult(11, 'Standard UAE trigger uses configured 90-day lead time', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 12: Manager/Frequent Traveler uses configured 180-day lead time
  // -------------------------------------------------------------------------
  try {
    await pool.request().query(`
      UPDATE dbo.Employee
      SET SubsidiaryID = 'uae',
          UAEEmployeeCategory = 'Manager',
          VisaExpiry = DATEADD(day, 150, CAST(GETDATE() AS DATE))
      WHERE EmpID = 23;

      DELETE FROM dbo.CaseChecklistProgress WHERE CaseID IN (SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = 23 AND EventCode = 'UAE_VISA_RENEWAL');
      DELETE FROM dbo.CaseStageHistory WHERE CaseID IN (SELECT CaseID FROM dbo.ComplianceCase WHERE EmpID = 23 AND EventCode = 'UAE_VISA_RENEWAL');
      DELETE FROM dbo.WorkQueueTask WHERE TargetEmpID = 23 AND SourceModule = 'Compliance';
      DELETE FROM dbo.ComplianceCase WHERE EmpID = 23 AND EventCode = 'UAE_VISA_RENEWAL';
    `);

    const scanRes = await api('/compliance/scan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });

    const caseCheck = await pool.request().query(`
      SELECT CaseID, CaseNumber, EventCode, CurrentStageKey FROM dbo.ComplianceCase WHERE EmpID = 23 AND EventCode = 'UAE_VISA_RENEWAL' ORDER BY CaseID DESC;
    `);

    const passed = scanRes.ok && caseCheck.recordset.length > 0;
    recordResult(
      12,
      'Manager/Frequent Traveler uses configured 180-day lead time',
      passed,
      `Manager expiry in 150 days detected under 180-day executive rule -> Case ${caseCheck.recordset[0]?.CaseNumber} created`,
    );
  } catch (err) {
    recordResult(12, 'Manager/Frequent Traveler uses configured 180-day lead time', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 13: UAE closure is blocked with missing checklist items
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 21 AND EventCode = 'UAE_VISA_RENEWAL' ORDER BY CaseID DESC;
    `);
    const cId = caseRow.recordset[0].CaseID;

    // Fast-forward case to RESIDENCE_VISA_RENEWAL (Stage 12)
    await pool.request().query(`
      UPDATE dbo.ComplianceCase
      SET CurrentStageKey = 'RESIDENCE_VISA_RENEWAL', Status = 'IN_PROGRESS'
      WHERE CaseID = ${cId};

      UPDATE dbo.CaseChecklistProgress
      SET IsCompleted = 0, CompletedAt = NULL
      WHERE CaseID = ${cId} AND ItemLabel NOT LIKE '%N/A%';
    `);

    // Attempt to close case when checklist items are pending
    const closeBlocked = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrUaeAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'Attempting premature closure' }),
    });

    const passed = closeBlocked.status === 400 && closeBlocked.data.message.includes('Required checklist items pending');
    recordResult(
      13,
      'UAE closure is blocked with missing checklist items',
      passed,
      `Closure blocked with HTTP ${closeBlocked.status}: "${closeBlocked.data.message}"`,
    );
  } catch (err) {
    recordResult(13, 'UAE closure is blocked with missing checklist items', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 14: UAE closure succeeds when all applicable items are satisfied
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 21 AND EventCode = 'UAE_VISA_RENEWAL' ORDER BY CaseID DESC;
    `);
    const cId = caseRow.recordset[0].CaseID;

    // Satisfy all checklist items for this case
    await pool.request().query(`
      UPDATE dbo.CaseChecklistProgress
      SET IsCompleted = 1, CompletedAt = SYSDATETIME()
      WHERE CaseID = ${cId};
    `);

    // Now attempt closure
    const closeSuccess = await api(`/compliance/cases/${cId}/advance`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${hrUaeAuth.token}` },
      body: JSON.stringify({ action: 'APPROVE', comments: 'All 9 checklist documents and confirmations verified' }),
    });

    const caseCheck = await pool.request().query(`
      SELECT CurrentStageKey, Status, ClosedAt FROM dbo.ComplianceCase WHERE CaseID = ${cId};
    `);

    const passed = closeSuccess.ok && caseCheck.recordset[0].Status === 'COMPLETED' && caseCheck.recordset[0].ClosedAt !== null;
    recordResult(
      14,
      'UAE closure succeeds when all applicable items are satisfied',
      passed,
      `Case closed successfully. Stage: ${caseCheck.recordset[0].CurrentStageKey}, Status: ${caseCheck.recordset[0].Status}, ClosedAt: ${caseCheck.recordset[0].ClosedAt}`,
    );
  } catch (err) {
    recordResult(14, 'UAE closure succeeds when all applicable items are satisfied', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 15: Passport reminders do not duplicate
  // -------------------------------------------------------------------------
  try {
    await pool.request().query(`
      UPDATE dbo.PassportDetail
      SET ExpiryDate = DATEADD(day, 180, CAST(GETDATE() AS DATE)),
          IsActive = 1
      WHERE EmpID = 2;
    `);

    // Run scanner twice
    await api('/compliance/scan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });
    await api('/compliance/scan', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });

    const distinctAlerts = await pool.request().query(`
      SELECT PassportID, AlertType, COUNT(*) as cnt
      FROM dbo.PassportAlertLog
      GROUP BY PassportID, AlertType
      HAVING COUNT(*) > 1;
    `);

    const passed = distinctAlerts.recordset.length === 0;
    recordResult(
      15,
      'Passport reminders do not duplicate',
      passed,
      `Verified zero duplicate alerts logged across all active passports after consecutive scan cycles.`,
    );
  } catch (err) {
    recordResult(15, 'Passport reminders do not duplicate', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 16: Employee cannot access another employee's restricted case
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 18;
    `);
    const rahulCaseId = caseRow.recordset[0].CaseID;

    const forbiddenRes = await api(`/compliance/cases/${rahulCaseId}`, {
      headers: { Authorization: `Bearer ${empSaleemAuth.token}` },
    });

    const passed = forbiddenRes.status === 403;
    recordResult(
      16,
      "Employee cannot access another employee's restricted case",
      passed,
      `Saleem (EmpID: 2) requesting Rahul's case (EmpID: 18) returned HTTP ${forbiddenRes.status}: "${forbiddenRes.data.message}"`,
    );
  } catch (err) {
    recordResult(16, "Employee cannot access another employee's restricted case", false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 17: HOD cannot access unrelated HOD cases
  // -------------------------------------------------------------------------
  try {
    const caseRow = await pool.request().query(`
      SELECT TOP 1 CaseID FROM dbo.ComplianceCase WHERE EmpID = 2;
    `);
    const saleemCaseId = caseRow.recordset[0].CaseID;

    const forbiddenRes = await api(`/compliance/cases/${saleemCaseId}`, {
      headers: { Authorization: `Bearer ${hodSaudiAuth.token}` },
    });

    const passed = forbiddenRes.status === 403;
    recordResult(
      17,
      'HOD cannot access unrelated HOD cases',
      passed,
      `HOD Saudi requesting unrelated UAE employee case returned HTTP ${forbiddenRes.status}: "${forbiddenRes.data.message}"`,
    );
  } catch (err) {
    recordResult(17, 'HOD cannot access unrelated HOD cases', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 18: Existing Section 2/2A document and Work Queue functionality remains operational
  // -------------------------------------------------------------------------
  try {
    const wqRes = await api('/work-queue/tasks', {
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });

    const docRes = await api('/documents', {
      headers: { Authorization: `Bearer ${adminAuth.token}` },
    });

    const passed = wqRes.ok && Array.isArray(wqRes.data) && docRes.ok && Array.isArray(docRes.data);
    recordResult(
      18,
      'Existing Section 2/2A document and Work Queue functionality remains operational',
      passed,
      `Work Queue tasks: ${wqRes.data.length} active tasks. Document Center: ${docRes.data.length} registered documents.`,
    );
  } catch (err) {
    recordResult(18, 'Existing Section 2/2A document and Work Queue functionality remains operational', false, err.message);
  }

  // -------------------------------------------------------------------------
  // Scenario 19: Existing employee, leave, passport, vehicle, and flight APIs remain functional
  // -------------------------------------------------------------------------
  try {
    const [empRes, leaveRes, ppAlertsRes, ppEmpRes, vRes, flightRes] = await Promise.all([
      api('/employees', { headers: { Authorization: `Bearer ${adminAuth.token}` } }),
      api('/leaves', { headers: { Authorization: `Bearer ${adminAuth.token}` } }),
      api('/passports/alerts', { headers: { Authorization: `Bearer ${adminAuth.token}` } }),
      api('/passports/2', { headers: { Authorization: `Bearer ${adminAuth.token}` } }),
      api('/vehicle-allocations/2', { headers: { Authorization: `Bearer ${adminAuth.token}` } }),
      api('/flight-tickets/2', { headers: { Authorization: `Bearer ${adminAuth.token}` } }),
    ]);

    const passed =
      empRes.ok &&
      leaveRes.ok &&
      ppAlertsRes.ok &&
      ppEmpRes.ok &&
      vRes.ok &&
      flightRes.ok;
    recordResult(
      19,
      'Existing employee, leave, passport, vehicle, and flight APIs remain functional',
      passed,
      `All 5 legacy modules operational: Employees(${empRes.status}), Leaves(${leaveRes.status}), Passports(${ppEmpRes.status}), Vehicles(${vRes.status}), Flights(${flightRes.status})`,
    );
  } catch (err) {
    recordResult(19, 'Existing employee, leave, passport, vehicle, and flight APIs remain functional', false, err.message);
  }

  console.log('\n================================================================');
  console.log(`TOTAL SCENARIOS VERIFIED: ${testResults.length} / 19`);
  const allPassed = testResults.every((t) => t.passed);
  console.log(`ALL SCENARIOS PASSED: ${allPassed ? 'YES ✅' : 'NO ❌'}`);
  console.log('================================================================');

  await pool.close();
}

runTests().catch((err) => {
  console.error('Fatal testing error:', err);
  process.exit(1);
});
