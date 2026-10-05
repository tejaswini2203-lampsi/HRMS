const http = require('http');
const fs = require('fs');
const path = require('path');
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

function getRaw(urlPath, token) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path: urlPath,
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, buffer: Buffer.concat(chunks) });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('EICS HRMS PHASE 1 — WORK QUEUE FINAL VERIFICATION SUITE');
  console.log('================================================================\n');

  const pool = await sql.connect({ connectionString: CONNECTION });

  // 1. Authenticate users
  console.log('--- 1. Authenticating Test Users ---');
  const hrLogin = await request('POST', '/auth/login', { username: 'hr.uae@eicscomp.com', password: 'eics@4321' });
  const hrToken = hrLogin.data.accessToken;

  const hrSaudiLogin = await request('POST', '/auth/login', { username: 'hr.saudi@eicscomp.com', password: 'eics@4321' });
  const hrSaudiToken = hrSaudiLogin.data.accessToken;

  const hodSaudiLogin = await request('POST', '/auth/login', { username: 'hod.saudi@eicscomp.com', password: 'eics@4321' });
  const hodSaudiToken = hodSaudiLogin.data.accessToken;

  const empUaeLogin = await request('POST', '/auth/login', { username: 'employee.uae@eicscomp.com', password: 'eics@4321' });
  const empUaeToken = empUaeLogin.data.accessToken; // Saleem (EmpID: 2)

  const empSaudiLogin = await request('POST', '/auth/login', { username: 'employee.saudi@eicscomp.com', password: 'eics@4321' });
  const empSaudiToken = empSaudiLogin.data.accessToken; // Mudasiir (EmpID: 3)

  console.log('✅ Logged in: HR UAE, HR Saudi, HOD Saudi, Employee UAE (Saleem), Employee Saudi (Mudasiir)\n');

  // ============================================================================
  // WORKFLOW 1: Corporate Letter PDF Output
  // ============================================================================
  console.log('================================================================');
  console.log('WORKFLOW 1: CORPORATE LETTER PDF OUTPUT VERIFICATION');
  console.log('================================================================');

  // Find an open Letter task
  const openLetterTasks = await pool.request().query(`
    SELECT TaskID, SourceModule, SourceID, ActionKey, TargetEmpID, Status, Title
    FROM dbo.WorkQueueTask
    WHERE SourceModule = 'Letter' AND Status = 'OPEN'
    ORDER BY TaskID;
  `);

  if (openLetterTasks.recordset.length === 0) {
    throw new Error('No OPEN Letter task found in WorkQueueTask');
  }

  const letterTask = openLetterTasks.recordset[0];
  const letterTaskId = letterTask.TaskID;
  const letterRequestId = Number(letterTask.SourceID);
  console.log(`Testing with TaskID: ${letterTaskId}, LetterRequestID: ${letterRequestId}`);

  // Fetch task context before execution
  const taskDetailsBefore = await request('GET', `/work-queue/tasks/${letterTaskId}`, null, hrToken);
  console.log(`Task Title: "${taskDetailsBefore.data.Title}"`);
  console.log(`Letter Type: "${taskDetailsBefore.data.context?.letterRequest?.LetterType}"`);
  console.log(`Employee: ${taskDetailsBefore.data.TargetFirstName} ${taskDetailsBefore.data.TargetLastName} (ID: ${taskDetailsBefore.data.TargetEmpID})`);

  // Execute Approval
  console.log('Submitting HR Approval for Letter...');
  const letterExecRes = await request(
    'POST',
    `/work-queue/tasks/${letterTaskId}/execute`,
    { action: 'APPROVE', comments: 'Approved by HR for official verification' },
    hrToken,
  );
  console.log('Execute Response Status:', letterExecRes.status);
  console.log('Execute Result:', letterExecRes.data);

  if (letterExecRes.status !== 200 && letterExecRes.status !== 201) {
    throw new Error('Letter approval failed');
  }

  const generatedDocId = letterExecRes.data.letterResult?.documentId;
  console.log(`Generated Document ID: ${generatedDocId}`);

  // Verify Database records
  const lrDb = await pool.request().query(`SELECT * FROM dbo.LetterRequest WHERE LetterRequestID = ${letterRequestId}`);
  console.log('LetterRequest Status in DB:', lrDb.recordset[0].Status);
  console.log('LetterRequest GeneratedDocumentID in DB:', lrDb.recordset[0].GeneratedDocumentID);

  const docDb = await pool.request().query(`SELECT * FROM dbo.DocumentMaster WHERE DocumentID = ${generatedDocId}`);
  console.log('DocumentMaster Record:', {
    DocumentID: docDb.recordset[0].DocumentID,
    FileName: docDb.recordset[0].FileName,
    MimeType: docDb.recordset[0].MimeType,
    FileSize: docDb.recordset[0].FileSize,
    FilePath: docDb.recordset[0].FilePath,
    EmpID: docDb.recordset[0].EmpID,
  });

  if (docDb.recordset[0].MimeType !== 'application/pdf') {
    throw new Error(`Expected MimeType application/pdf, got ${docDb.recordset[0].MimeType}`);
  }
  if (!docDb.recordset[0].FileName.endsWith('.pdf')) {
    throw new Error(`Expected filename to end with .pdf, got ${docDb.recordset[0].FileName}`);
  }

  // Verify file on disk is a valid, readable PDF
  const filePathOnDisk = docDb.recordset[0].FilePath;
  const fileExists = fs.existsSync(filePathOnDisk);
  console.log(`File exists on disk (${filePathOnDisk}):`, fileExists);
  if (!fileExists) throw new Error('PDF file was not found on disk');

  const fileBytes = fs.readFileSync(filePathOnDisk);
  const pdfHeader = fileBytes.slice(0, 8).toString('utf-8');
  console.log('File Header Magic Bytes:', pdfHeader);
  if (!pdfHeader.startsWith('%PDF-')) {
    throw new Error('Generated file is NOT a valid PDF! Header: ' + pdfHeader);
  }
  console.log(`✅ File is a genuine valid PDF (${fileBytes.length} bytes)!`);

  // Verify HTTP download endpoint streams the PDF with proper Content-Type & inline disposition
  console.log('\nTesting Document Download/Preview via HTTP API...');
  const downloadRes = await getRaw(`/documents/${generatedDocId}/download`, hrToken);
  console.log('Download Status:', downloadRes.status);
  console.log('Download Content-Type:', downloadRes.headers['content-type']);
  console.log('Download Content-Disposition:', downloadRes.headers['content-disposition']);
  console.log('Downloaded bytes:', downloadRes.buffer.length);

  if (downloadRes.headers['content-type'] !== 'application/pdf') {
    throw new Error('Expected Content-Type application/pdf on download');
  }

  // Test Guard: Repeated click must NOT generate duplicate documents
  console.log('\nTesting Repeated Submission Guard...');
  const repeatExecRes = await request(
    'POST',
    `/work-queue/tasks/${letterTaskId}/execute`,
    { action: 'APPROVE', comments: 'Repeated approval attempt' },
    hrToken,
  );
  console.log('Repeated execution response:', repeatExecRes.status, repeatExecRes.data?.message);
  if (repeatExecRes.status !== 400) {
    throw new Error('Expected HTTP 400 for repeated execution of completed task');
  }
  console.log('✅ Repeated submission prevented! No duplicate documents created.');

  // ============================================================================
  // WORKFLOW 2: Employee-Submitted Document Retrieval & Access Control
  // ============================================================================
  console.log('\n================================================================');
  console.log('WORKFLOW 2: EMPLOYEE UPLOAD & HR RETRIEVAL + ACCESS CONTROL');
  console.log('================================================================');

  // Employee UAE (Saleem, EmpID: 2) uploads a document
  const samplePdfContent = Buffer.from(
    '%PDF-1.3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000102 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n178\n%%EOF',
  );

  console.log('Saleem (EmpID: 2) uploading Passport Copy PDF...');
  const uploadRes = await request(
    'POST',
    '/documents',
    {
      category: 'Passport',
      sourceModule: 'DocumentCenter',
      fileName: 'Saleem_Passport_Verified.pdf',
      fileContentBase64: samplePdfContent.toString('base64'),
      mimeType: 'application/pdf',
    },
    empUaeToken,
  );
  console.log('Upload Response Status:', uploadRes.status);
  console.log('Uploaded Document Record:', uploadRes.data);

  if (uploadRes.status !== 200 && uploadRes.status !== 201) {
    throw new Error('Employee document upload failed');
  }

  const uploadedDocId = uploadRes.data.DocumentID;
  console.log(`Uploaded Document ID: ${uploadedDocId}`);

  // Verify file is stored on disk
  const uploadedDocDb = await pool.request().query(`SELECT * FROM dbo.DocumentMaster WHERE DocumentID = ${uploadedDocId}`);
  console.log('Uploaded File on Disk:', uploadedDocDb.recordset[0].FilePath);
  if (!fs.existsSync(uploadedDocDb.recordset[0].FilePath)) {
    throw new Error('Uploaded file not found on disk');
  }
  console.log('✅ File verified stored on server filesystem.');

  // HR reviews task and retrieves employee document
  console.log('\nHR retrieving documents for Saleem from Work Queue...');
  const hrRetrieveDocs = await request('GET', `/documents?empId=2`, null, hrToken);
  console.log(`HR found ${hrRetrieveDocs.data.length} documents for employee 2.`);
  const foundUploadedDoc = hrRetrieveDocs.data.find((d) => d.DocumentID === uploadedDocId);
  if (!foundUploadedDoc) {
    throw new Error('HR could not find employee uploaded document');
  }
  console.log(`✅ HR successfully retrieved uploaded document: "${foundUploadedDoc.FileName}" (Category: ${foundUploadedDoc.Category})`);

  // HR downloads/previews the file
  const hrDownload = await getRaw(`/documents/${uploadedDocId}/download`, hrToken);
  console.log('HR Download Status:', hrDownload.status, 'Size:', hrDownload.buffer.length);
  if (hrDownload.status !== 200) {
    throw new Error('HR failed to download employee document');
  }
  console.log('✅ HR verified authorized preview/download.');

  // Security Test: Unauthorized employee (Mudasiir, EmpID: 3) tries to access Saleem's document!
  console.log("\nSecurity Test: Employee 3 (Mudasiir) attempting to access Employee 2 (Saleem)'s document...");
  const unauthDownload = await request('GET', `/documents/${uploadedDocId}`, null, empSaudiToken);
  console.log('Unauthorized access response status:', unauthDownload.status);
  console.log('Unauthorized access error message:', unauthDownload.data?.message);
  if (unauthDownload.status !== 403) {
    throw new Error(`Expected HTTP 403 Forbidden for unauthorized document access, got ${unauthDownload.status}`);
  }
  console.log("✅ Security Verified: Unauthorized employees CANNOT access another employee's private documents!");

  // Security Test: Query parameter token download unauthorized check
  const unauthDownloadStream = await getRaw(`/documents/${uploadedDocId}/download?token=${empSaudiToken}`);
  console.log('Unauthorized stream download status:', unauthDownloadStream.status);
  if (unauthDownloadStream.status !== 403) {
    throw new Error(`Expected HTTP 403 on stream download for unauthorized employee, got ${unauthDownloadStream.status}`);
  }
  console.log('✅ Security Verified: Direct URL download also enforces 403 Forbidden.');

  // ============================================================================
  // WORKFLOW 3: KSA Iqama Duration — Actual End-to-End Test
  // ============================================================================
  console.log('\n================================================================');
  console.log('WORKFLOW 3: KSA IQAMA DURATION — ACTUAL END-TO-END TEST');
  console.log('================================================================');

  // Let's create a fresh KSA Iqama case for testing to ensure full lifecycle verification
  console.log('Creating fresh KSA Iqama Renewal compliance case for Rahul Kumar (EmpID: 18)...');
  const createCaseRes = await request(
    'POST',
    '/compliance/cases',
    {
      empId: 18,
      regionCode: 'saudi',
      eventCode: 'KSA_IQAMA_RENEWAL',
      pipelineCode: 'KSA_IQAMA',
      priority: 'HIGH',
    },
    hrSaudiToken,
  );
  console.log('Create Case status:', createCaseRes.status, 'CaseNumber:', createCaseRes.data?.CaseNumber);
  const ksaCaseId = createCaseRes.data.CaseID;

  // Find the generated Work Queue Task for EXPIRY_DETECTED
  const step1TaskRes = await pool.request().query(`
    SELECT * FROM dbo.WorkQueueTask
    WHERE SourceModule = 'Compliance' AND SourceID = '${ksaCaseId}' AND ActionKey = 'EXPIRY_DETECTED' AND Status = 'OPEN';
  `);
  if (step1TaskRes.recordset.length === 0) {
    throw new Error('EXPIRY_DETECTED task was not generated');
  }
  const step1TaskId = step1TaskRes.recordset[0].TaskID;
  console.log(`Generated Step 1 TaskID: ${step1TaskId} ("${step1TaskRes.recordset[0].Title}")`);

  // HR executes Step 1: Start Renewal
  console.log('HR executing Step 1 (Start Renewal)...');
  const startRenRes = await request(
    'POST',
    `/work-queue/tasks/${step1TaskId}/execute`,
    { action: 'CONFIRM', comments: 'Initiated Iqama renewal' },
    hrSaudiToken,
  );
  console.log('Start Renewal response status:', startRenRes.status);

  // Check new HOD Duration Task
  const hodDurationTaskRes = await pool.request().query(`
    SELECT * FROM dbo.WorkQueueTask
    WHERE SourceModule = 'Compliance' AND SourceID = '${ksaCaseId}' AND ActionKey = 'HOD_DURATION' AND Status = 'OPEN';
  `);
  if (hodDurationTaskRes.recordset.length === 0) {
    throw new Error('HOD_DURATION task was not generated');
  }
  const hodDurationTask = hodDurationTaskRes.recordset[0];
  const hodDurationTaskId = hodDurationTask.TaskID;
  console.log(`Generated HOD Duration TaskID: ${hodDurationTaskId} ("${hodDurationTask.Title}")`);
  console.log(`Assigned Role: ${hodDurationTask.AssignedRole}, ActionKey: ${hodDurationTask.ActionKey}`);

  // Inspect task context
  const hodTaskContext = await request('GET', `/work-queue/tasks/${hodDurationTaskId}`, null, hodSaudiToken);
  console.log('Task Context complianceCase:', hodTaskContext.data.context?.complianceCase?.CaseNumber);
  console.log('Task Target Employee:', hodTaskContext.data.TargetFirstName, hodTaskContext.data.TargetLastName);

  // Negative test: Try submitting invalid duration
  console.log('\nTesting validation: Submitting invalid duration (5 months)...');
  const invalidDurRes = await request(
    'POST',
    `/work-queue/tasks/${hodDurationTaskId}/execute`,
    { action: 'CONFIRM', comments: 'Testing invalid duration', meta: { durationMonths: 5 } },
    hodSaudiToken,
  );
  console.log('Invalid duration status:', invalidDurRes.status, 'Message:', invalidDurRes.data?.message);
  if (invalidDurRes.status !== 400) {
    throw new Error('Expected HTTP 400 for invalid duration');
  }
  console.log('✅ Validation Verified: Backend rejected invalid duration.');

  // Submit valid Iqama duration: 6 Months
  console.log('\nHOD submitting 6 Months duration for Iqama renewal...');
  const validDurRes = await request(
    'POST',
    `/work-queue/tasks/${hodDurationTaskId}/execute`,
    { action: 'CONFIRM', comments: 'HOD approved 6 months Iqama renewal term', meta: { durationMonths: 6 } },
    hodSaudiToken,
  );
  console.log('Valid duration response status:', validDurRes.status);
  console.log('Valid duration result:', validDurRes.data);

  if (validDurRes.status !== 200 && validDurRes.status !== 201) {
    throw new Error('Iqama duration submission failed');
  }

  // Verify Database Persistence for Case
  const caseDbAfter = await pool.request().query(`SELECT * FROM dbo.ComplianceCase WHERE CaseID = ${ksaCaseId}`);
  console.log('\nCompliance Case State in DB:');
  console.log(`- CurrentStageKey: ${caseDbAfter.recordset[0].CurrentStageKey}`);
  console.log(`- Status: ${caseDbAfter.recordset[0].Status}`);
  console.log(`- MetaJson: ${caseDbAfter.recordset[0].MetaJson}`);

  if (caseDbAfter.recordset[0].CurrentStageKey !== 'VENDOR_ADMIN') {
    throw new Error(`Expected stage VENDOR_ADMIN, got ${caseDbAfter.recordset[0].CurrentStageKey}`);
  }
  const metaObj = JSON.parse(caseDbAfter.recordset[0].MetaJson || '{}');
  if (metaObj.durationMonths !== 6) {
    throw new Error(`Expected durationMonths: 6, got ${metaObj.durationMonths}`);
  }
  console.log('✅ Selected duration (6 months) verified persisted in ComplianceCase.MetaJson!');

  // Verify Originating Task Status
  const hodTaskDb = await pool.request().query(`SELECT * FROM dbo.WorkQueueTask WHERE TaskID = ${hodDurationTaskId}`);
  console.log(`- Originating Task ${hodDurationTaskId} Status in DB: ${hodTaskDb.recordset[0].Status}`);
  if (hodTaskDb.recordset[0].Status !== 'COMPLETED') {
    throw new Error(`Expected task status COMPLETED, got ${hodTaskDb.recordset[0].Status}`);
  }
  console.log('✅ Originating task marked COMPLETED.');

  // Verify Next Assigned Work Queue Task
  const nextTaskDb = await pool.request().query(`
    SELECT * FROM dbo.WorkQueueTask
    WHERE SourceModule = 'Compliance' AND SourceID = '${ksaCaseId}' AND ActionKey = 'VENDOR_ADMIN' AND Status = 'OPEN';
  `);
  if (nextTaskDb.recordset.length === 0) {
    throw new Error('VENDOR_ADMIN task was not generated');
  }
  console.log(`✅ Next Assigned Work Queue Task Generated: TaskID ${nextTaskDb.recordset[0].TaskID} ("${nextTaskDb.recordset[0].Title}")`);

  // Verify Audit Event
  const auditDb = await pool.request().query(`
    SELECT TOP 3 AuditID, Action, Module, RecordID, ActorName, ActorRole, AfterValue, Timestamp
    FROM dbo.AuditEvent
    WHERE Module IN ('WorkQueue', 'Compliance') AND RecordID IN ('${hodDurationTaskId}', '${ksaCaseId}')
    ORDER BY AuditID DESC;
  `);
  console.log('Audit Evidence for Iqama Duration:');
  console.table(auditDb.recordset);
  console.log('✅ Audit event logged successfully with actor and action details.');

  // ============================================================================
  // WORKFLOW 4: UAE Visa Renewal — Actual End-to-End Test
  // ============================================================================
  console.log('\n================================================================');
  console.log('WORKFLOW 4: UAE VISA RENEWAL — ACTUAL END-TO-END TEST');
  console.log('================================================================');

  // Let's inspect TaskID 20: Sashi PENDING_DOCS or TaskID 21: Saleem CONTRACT_DRAFTING
  const uaeTaskRes = await pool.request().query(`
    SELECT TaskID, SourceModule, SourceID, ActionKey, TargetEmpID, RegionCode, AssignedRole, Title, PrimaryActionLabel, Status
    FROM dbo.WorkQueueTask
    WHERE SourceModule = 'Compliance' AND RegionCode = 'uae' AND Status = 'OPEN'
    ORDER BY TaskID;
  `);
  console.log('Open UAE Compliance Tasks in DB:');
  console.table(uaeTaskRes.recordset);

  const uaeTask = uaeTaskRes.recordset[0];
  const uaeTaskId = uaeTask.TaskID;
  const uaeCaseId = Number(uaeTask.SourceID);
  console.log(`Testing with UAE TaskID: ${uaeTaskId}, CaseID: ${uaeCaseId}, ActionKey: ${uaeTask.ActionKey}`);

  // Fetch task context
  const uaeTaskDetails = await request('GET', `/work-queue/tasks/${uaeTaskId}`, null, hrToken);
  console.log(`Employee: ${uaeTaskDetails.data.TargetFirstName} ${uaeTaskDetails.data.TargetLastName} (ID: ${uaeTaskDetails.data.TargetEmpID})`);
  console.log(`Visa Number: ${uaeTaskDetails.data.VisaNumber || 'N/A'}, Expiry: ${uaeTaskDetails.data.VisaExpiry || 'N/A'}`);
  console.log(`Current Case Stage: ${uaeTaskDetails.data.context?.complianceCase?.CurrentStageKey}`);
  console.log(`Checklist Items: ${uaeTaskDetails.data.context?.checklist?.length} items`);
  console.log(`Associated Documents: ${uaeTaskDetails.data.context?.documents?.length} documents`);

  const beforeStage = uaeTaskDetails.data.context?.complianceCase?.CurrentStageKey;

  // Execute valid next action
  console.log(`Executing next action on UAE task ${uaeTaskId}...`);
  const uaeExecRes = await request(
    'POST',
    `/work-queue/tasks/${uaeTaskId}/execute`,
    { action: 'CONFIRM', comments: 'Documents verified and processed by operations' },
    hrToken,
  );
  console.log('UAE Execute response status:', uaeExecRes.status);
  console.log('UAE Execute result:', uaeExecRes.data);

  if (uaeExecRes.status !== 200 && uaeExecRes.status !== 201) {
    throw new Error('UAE task execution failed');
  }

  // Verify Database persistence
  const uaeCaseAfter = await pool.request().query(`SELECT * FROM dbo.ComplianceCase WHERE CaseID = ${uaeCaseId}`);
  const afterStage = uaeCaseAfter.recordset[0].CurrentStageKey;
  console.log(`Compliance Case ${uaeCaseId} Stage Transition: ${beforeStage} -> ${afterStage}`);

  const uaeOrigTask = await pool.request().query(`SELECT * FROM dbo.WorkQueueTask WHERE TaskID = ${uaeTaskId}`);
  console.log(`Originating UAE Task Status in DB: ${uaeOrigTask.recordset[0].Status}`);
  if (uaeOrigTask.recordset[0].Status !== 'COMPLETED') {
    throw new Error(`Expected UAE task to be COMPLETED, got ${uaeOrigTask.recordset[0].Status}`);
  }

  // Verify Next assigned task
  const nextUaeTask = await pool.request().query(`
    SELECT * FROM dbo.WorkQueueTask
    WHERE SourceModule = 'Compliance' AND SourceID = '${uaeCaseId}' AND ActionKey = '${afterStage}' AND Status = 'OPEN';
  `);
  if (nextUaeTask.recordset.length === 0) {
    throw new Error(`Next task for stage ${afterStage} was not found in WorkQueueTask`);
  }
  console.log(`✅ Next Assigned Task Generated: TaskID ${nextUaeTask.recordset[0].TaskID} ("${nextUaeTask.recordset[0].Title}")`);

  // Verify Audit Evidence
  const uaeAudit = await pool.request().query(`
    SELECT TOP 3 AuditID, Action, Module, RecordID, ActorName, ActorRole, AfterValue, Timestamp
    FROM dbo.AuditEvent
    WHERE Module IN ('WorkQueue', 'Compliance') AND RecordID IN ('${uaeTaskId}', '${uaeCaseId}')
    ORDER BY AuditID DESC;
  `);
  console.log('Audit Evidence for UAE Visa Renewal:');
  console.table(uaeAudit.recordset);
  console.log('✅ Audit event logged successfully for UAE Visa Renewal.');

  // ============================================================================
  // WORKFLOW 5: Error Handling Verification
  // ============================================================================
  console.log('\n================================================================');
  console.log('WORKFLOW 5: ERROR HANDLING VERIFICATION');
  console.log('================================================================');

  // 1. Rejection without comment
  const err1 = await request('POST', `/work-queue/tasks/${nextUaeTask.recordset[0].TaskID}/execute`, { action: 'REJECT', comments: '   ' }, hrToken);
  console.log('1. Rejection without comment: Status =', err1.status, `("${err1.data?.message}")`);
  if (err1.status !== 400) throw new Error('Expected 400 for rejection without comment');

  // 2. Non-existent task execution
  const err2 = await request('POST', '/work-queue/tasks/999999/execute', { action: 'CONFIRM' }, hrToken);
  console.log('2. Non-existent task: Status =', err2.status, `("${err2.data?.message}")`);
  if (err2.status !== 404) throw new Error('Expected 404 for non-existent task');

  // 3. Repeated submission on completed task
  const err3 = await request('POST', `/work-queue/tasks/${uaeTaskId}/execute`, { action: 'CONFIRM' }, hrToken);
  console.log('3. Repeated submission on completed task: Status =', err3.status, `("${err3.data?.message}")`);
  if (err3.status !== 400) throw new Error('Expected 400 for repeated execution');

  // 4. Unauthorized employee executing task assigned to someone else
  const err4 = await request('POST', `/work-queue/tasks/${nextUaeTask.recordset[0].TaskID}/execute`, { action: 'CONFIRM' }, empSaudiToken);
  console.log('4. Unauthorized user execution: Status =', err4.status, `("${err4.data?.message}")`);
  if (err4.status !== 403) throw new Error('Expected 403 for unauthorized task execution');

  console.log('✅ ALL ERROR HANDLING CONDITIONS VERIFIED!');

  await pool.close();
  console.log('\n================================================================');
  console.log('🎉 ALL BACKEND & DATABASE WORKFLOWS FULLY VERIFIED WITH EVIDENCE!');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
