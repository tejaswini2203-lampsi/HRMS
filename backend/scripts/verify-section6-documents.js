const http = require('http');
const sql = require('mssql/msnodesqlv8');
const { execSync } = require('child_process');

const CONNECTION =
  'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS02;Database=EICS_DB;Trusted_Connection=Yes;TrustServerCertificate=Yes;';

function request(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3000,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
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
    if (payload) req.write(payload);
    req.end();
  });
}

const get = (path, token) => request('GET', path, null, token);
const post = (path, data, token) => request('POST', path, data, token);
const patch = (path, data, token) => request('PATCH', path, data, token);

async function runSection6Verification() {
  console.log('================================================================');
  console.log('   EICS HRMS PHASE 1 — SECTION 6 DOCUMENT MANAGEMENT & E-SIGN');
  console.log('   Full 20-Point Verification & Regression Suite');
  console.log('================================================================\n');

  let passedCount = 0;
  const totalTests = 20;
  const pool = await sql.connect({ connectionString: CONNECTION });

  // 0. Setup and Authenticate Personas
  console.log('--- Step 0: Authenticating Personas ---');
  const login = async (username) => {
    const res = await post('/auth/login', { username, password: 'eics@4321' });
    if (res.status !== 200 && res.status !== 201) {
      throw new Error(`Login failed for ${username}: ${JSON.stringify(res)}`);
    }
    return { token: res.data.accessToken, user: res.data.user };
  };

  const empSaudi = await login('employee.saudi@eicscomp.com');
  console.log('✔ Employee Saudi authenticated (EmpID:', empSaudi.user.empId, ')');

  const empUae = await login('employee.uae@eicscomp.com');
  console.log('✔ Employee UAE authenticated (EmpID:', empUae.user.empId, ')');

  const hodSaudi = await login('hod.saudi@eicscomp.com');
  console.log('✔ HOD Saudi authenticated (EmpID:', hodSaudi.user.empId, ')');

  const hrSaudi = await login('hr.saudi@eicscomp.com');
  console.log('✔ HR Saudi authenticated (EmpID:', hrSaudi.user.empId, ')');

  const adminSaudi = await login('admin.saudi@eicscomp.com');
  console.log('✔ Admin Saudi authenticated (EmpID:', adminSaudi.user.empId, ')\n');

  let complianceDocId = null;
  let complianceCaseId = null;
  let letterDocId = null;
  let generalDocId = null;
  let version2DocId = null;

  // -------------------------------------------------------------------------
  // TEST 1: Existing Compliance document upload still works
  // -------------------------------------------------------------------------
  try {
    const cases = await get('/compliance/cases?limit=5', hrSaudi.token);
    const existingCase = Array.isArray(cases.data) ? cases.data[0] : (cases.data?.cases?.[0] || cases.data?.data?.[0]);
    complianceCaseId = existingCase?.CaseID || 1;

    const sampleContent = Buffer.from('%PDF-1.4 Mock Compliance Renewal Document').toString('base64');
    const res = await post(
      '/documents',
      {
        category: 'Compliance Document',
        sourceModule: 'Compliance',
        sourceId: String(complianceCaseId),
        empId: empSaudi.user.empId,
        fileName: 'MOHRE_Renewal_Form.pdf',
        fileContentBase64: sampleContent,
        mimeType: 'application/pdf',
      },
      hrSaudi.token,
    );

    if (res.status === 201 && res.data?.DocumentID) {
      complianceDocId = res.data.DocumentID;
      console.log('✔ TEST 1 PASSED: Existing Compliance document upload works (DocID:', complianceDocId, ')');
      passedCount++;
    } else {
      console.error('❌ TEST 1 FAILED:', res);
    }
  } catch (err) {
    console.error('❌ TEST 1 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Existing Compliance document download still works
  // -------------------------------------------------------------------------
  try {
    const res = await get(`/documents/${complianceDocId}/download`, hrSaudi.token);
    if (res.status === 200 && typeof res.data === 'string' && res.data.includes('%PDF')) {
      console.log('✔ TEST 2 PASSED: Existing Compliance document download stream works');
      passedCount++;
    } else {
      console.error('❌ TEST 2 FAILED:', res.status, typeof res.data);
    }
  } catch (err) {
    console.error('❌ TEST 2 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Existing Compliance version history still works
  // -------------------------------------------------------------------------
  try {
    const res = await get(`/documents/${complianceDocId}/versions`, hrSaudi.token);
    if (res.status === 200 && Array.isArray(res.data) && res.data.length >= 1) {
      console.log('✔ TEST 3 PASSED: Compliance version history retrieved (count:', res.data.length, ')');
      passedCount++;
    } else {
      console.error('❌ TEST 3 FAILED:', res);
    }
  } catch (err) {
    console.error('❌ TEST 3 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Existing Compliance e-signature still works
  // -------------------------------------------------------------------------
  try {
    const sigRes = await post(
      '/signatures',
      {
        documentId: complianceDocId,
        sourceModule: 'Compliance',
        sourceId: String(complianceCaseId),
        signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
      hrSaudi.token,
    );
    if (sigRes.status === 201 && sigRes.data?.VerificationHash) {
      console.log('✔ TEST 4 PASSED: Compliance e-signature captured (Hash:', sigRes.data.VerificationHash.slice(0, 16), '...)');
      passedCount++;
    } else {
      console.error('❌ TEST 4 FAILED:', sigRes);
    }
  } catch (err) {
    console.error('❌ TEST 4 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Existing Letter Request PDF generation still works
  // -------------------------------------------------------------------------
  let letterReqId = null;
  try {
    const createReq = await post(
      '/letters',
      {
        letterType: 'Experience Letter',
        purpose: 'Bank verification Section 6 regression',
        addressee: 'Saudi National Bank',
      },
      empSaudi.token,
    );
    letterReqId = createReq.data?.letterRequestId || createReq.data?.LetterRequestID || createReq.data?.RequestID;

    // Issue letter with HR signature
    const issueRes = await post(
      `/letters/${letterReqId}/issue`,
      {
        signatureData: 'data:image/png;base64,mockSignatureSection6',
      },
      hrSaudi.token,
    );

    if (issueRes.status === 201 && issueRes.data?.documentId) {
      letterDocId = issueRes.data.documentId;
      console.log('✔ TEST 5 PASSED: Letter PDF generation works (DocID:', letterDocId, ')');
      passedCount++;
    } else {
      console.error('❌ TEST 5 FAILED:', issueRes);
    }
  } catch (err) {
    console.error('❌ TEST 5 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 6: Existing Letter Request e-signature still works
  // -------------------------------------------------------------------------
  try {
    const sigs = await get(`/signatures?sourceModule=Letters&sourceId=${letterReqId}`, hrSaudi.token);
    if (sigs.status === 200 && Array.isArray(sigs.data) && sigs.data.length > 0) {
      console.log('✔ TEST 6 PASSED: Letter e-signature verified in SignatureEvent (Signer:', sigs.data[0].SignerName, ')');
      passedCount++;
    } else {
      console.error('❌ TEST 6 FAILED:', sigs);
    }
  } catch (err) {
    console.error('❌ TEST 6 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 7: Signed Letter Request document appears in central repository
  // -------------------------------------------------------------------------
  try {
    const centralDocs = await get(`/documents?category=Letter`, hrSaudi.token);
    const found = Array.isArray(centralDocs.data) && centralDocs.data.some((d) => d.DocumentID === letterDocId);
    if (found) {
      console.log('✔ TEST 7 PASSED: Signed Letter Request document appears in Central Repository');
      passedCount++;
    } else {
      console.error('❌ TEST 7 FAILED: Letter DocID not found in central repository list');
    }
  } catch (err) {
    console.error('❌ TEST 7 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 8: Compliance document appears in central repository
  // -------------------------------------------------------------------------
  try {
    const centralDocs = await get(`/documents?sourceModule=Compliance`, hrSaudi.token);
    const found = Array.isArray(centralDocs.data) && centralDocs.data.some((d) => d.DocumentID === complianceDocId);
    if (found) {
      console.log('✔ TEST 8 PASSED: Compliance document appears in Central Repository');
      passedCount++;
    } else {
      console.error('❌ TEST 8 FAILED: Compliance DocID not found in central repository list');
    }
  } catch (err) {
    console.error('❌ TEST 8 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 9: General document can be uploaded
  // -------------------------------------------------------------------------
  try {
    const content = Buffer.from('%PDF-1.4 Standalone Policy Acknowledgment Document').toString('base64');
    const res = await post(
      '/documents',
      {
        category: 'Policy Acknowledgment',
        sourceModule: 'GENERAL',
        empId: empSaudi.user.empId,
        fileName: 'IT_Security_Policy_Acknowledgment.pdf',
        fileContentBase64: content,
        mimeType: 'application/pdf',
        description: 'Annual corporate IT policy acknowledgment',
        requiresSignature: true,
      },
      empSaudi.token,
    );

    if (res.status === 201 && res.data?.DocumentID) {
      generalDocId = res.data.DocumentID;
      if (res.data.SignatureStatus === 'PENDING_SIGNATURE') {
        console.log('✔ TEST 9 PASSED: General document uploaded with PENDING_SIGNATURE status (DocID:', generalDocId, ')');
        passedCount++;
      } else {
        console.error('❌ TEST 9 FAILED: SignatureStatus not PENDING_SIGNATURE:', res.data);
      }
    } else {
      console.error('❌ TEST 9 FAILED:', res);
    }
  } catch (err) {
    console.error('❌ TEST 9 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 10: New document version preserves old version
  // -------------------------------------------------------------------------
  try {
    const v2Content = Buffer.from('%PDF-1.4 IT Security Policy Revision v2 with updated password rules').toString('base64');
    const res = await post(
      `/documents/${generalDocId}/version`,
      {
        fileName: 'IT_Security_Policy_Acknowledgment_v2.pdf',
        fileContentBase64: v2Content,
        mimeType: 'application/pdf',
        description: 'Updated 2026 password complexity rules',
      },
      empSaudi.token,
    );

    if (res.status === 201 && res.data?.DocumentID && res.data.Version === 2) {
      version2DocId = res.data.DocumentID;

      // Verify that old version is still preserved and marked IsActiveVersion = 0
      const oldDoc = await pool.request().query(`
        SELECT DocumentID, Version, IsActiveVersion FROM dbo.DocumentMaster WHERE DocumentID = ${generalDocId};
      `);
      const newDoc = await pool.request().query(`
        SELECT DocumentID, Version, IsActiveVersion FROM dbo.DocumentMaster WHERE DocumentID = ${version2DocId};
      `);

      if (
        oldDoc.recordset[0].IsActiveVersion === false &&
        newDoc.recordset[0].IsActiveVersion === true
      ) {
        console.log('✔ TEST 10 PASSED: New document version (v2) created, old version (v1) preserved');
        passedCount++;
      } else {
        console.error('❌ TEST 10 FAILED: Version flag check failed', oldDoc.recordset, newDoc.recordset);
      }
    } else {
      console.error('❌ TEST 10 FAILED:', res);
    }
  } catch (err) {
    console.error('❌ TEST 10 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 11: Unauthorized user cannot access restricted document
  // -------------------------------------------------------------------------
  try {
    // Saudi employee tries to access UAE employee's private document or vice versa
    const res = await get(`/documents/${generalDocId}`, empUae.token);
    if (res.status === 403) {
      console.log('✔ TEST 11 PASSED: Unauthorized cross-employee document access strictly rejected with HTTP 403');
      passedCount++;
    } else {
      console.error('❌ TEST 11 FAILED: Expected 403, received:', res.status);
    }
  } catch (err) {
    console.error('❌ TEST 11 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 12: Employee can access their authorized documents
  // -------------------------------------------------------------------------
  try {
    const res = await get(`/documents/${generalDocId}`, empSaudi.token);
    if (res.status === 200 && res.data?.DocumentID === generalDocId) {
      console.log('✔ TEST 12 PASSED: Employee can access their own authorized document');
      passedCount++;
    } else {
      console.error('❌ TEST 12 FAILED:', res.status, res.data);
    }
  } catch (err) {
    console.error('❌ TEST 12 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 13: HR can search documents within permitted data scope
  // -------------------------------------------------------------------------
  try {
    const res = await get(`/documents?search=Security`, hrSaudi.token);
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      console.log('✔ TEST 13 PASSED: HR successfully searched documents in scope (found:', res.data.length, ')');
      passedCount++;
    } else {
      console.error('❌ TEST 13 FAILED:', res);
    }
  } catch (err) {
    console.error('❌ TEST 13 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 14: HOD hierarchy restrictions remain enforced
  // -------------------------------------------------------------------------
  try {
    // HOD Saudi accessing a document of an employee who does not report to him
    // Let's test with empUae's document:
    const uaeDocRes = await post(
      '/documents',
      {
        category: 'ID Copy',
        sourceModule: 'GENERAL',
        empId: empUae.user.empId,
        fileName: 'Emirates_ID_Saleem_Confidential.pdf',
        fileContentBase64: Buffer.from('UAE ID Copy').toString('base64'),
      },
      empUae.token,
    );
    const uaeDocId = uaeDocRes.data?.DocumentID;

    // HOD Saudi tries to access UAE employee's doc
    const hodCheck = await get(`/documents/${uaeDocId}`, hodSaudi.token);
    if (hodCheck.status === 403) {
      console.log('✔ TEST 14 PASSED: HOD unauthorized hierarchy access strictly blocked with HTTP 403');
      passedCount++;
    } else {
      console.error('❌ TEST 14 FAILED: Expected 403 for HOD out-of-hierarchy, received:', hodCheck.status);
    }
  } catch (err) {
    console.error('❌ TEST 14 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 15: Bulk upload works for valid documents
  // -------------------------------------------------------------------------
  try {
    const bulkPayload = {
      documents: [
        {
          empId: empSaudi.user.empId,
          category: 'Certificate',
          fileName: 'PMP_Certification_Verified.pdf',
          fileContentBase64: Buffer.from('%PDF Mock PMP').toString('base64'),
          mimeType: 'application/pdf',
        },
        {
          empId: empSaudi.user.empId,
          category: 'ID Copy',
          fileName: 'Saudi_National_ID_Copy.pdf',
          fileContentBase64: Buffer.from('%PDF Mock Saudi ID').toString('base64'),
          mimeType: 'application/pdf',
        },
      ],
    };

    const res = await post('/documents/bulk', bulkPayload, hrSaudi.token);
    if (res.status === 201 && res.data?.successful === 2 && res.data?.failed === 0) {
      console.log('✔ TEST 15 PASSED: Bulk upload imported 2 valid documents successfully');
      passedCount++;
    } else {
      console.error('❌ TEST 15 FAILED:', res);
    }
  } catch (err) {
    console.error('❌ TEST 15 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 16: Invalid bulk upload entries are rejected clearly
  // -------------------------------------------------------------------------
  try {
    const invalidBulk = {
      documents: [
        {
          empId: 999999, // non-existent employee
          category: 'Certificate',
          fileName: 'Ghost_Employee_Certificate.pdf',
        },
        {
          empId: empUae.user.empId, // employee in UAE, uploaded by Saudi HR
          category: 'Offer Letter',
          fileName: 'UAE_Offer_Letter.pdf',
        },
      ],
    };

    const res = await post('/documents/bulk', invalidBulk, hrSaudi.token);
    if (
      res.status === 201 &&
      res.data?.failed === 2 &&
      res.data?.results?.[0]?.error?.includes('does not exist') &&
      res.data?.results?.[1]?.error?.includes('outside your authorized regional jurisdiction')
    ) {
      console.log('✔ TEST 16 PASSED: Invalid bulk upload entries correctly identified and rejected with descriptive messages');
      passedCount++;
    } else {
      console.error('❌ TEST 16 FAILED:', res.data);
    }
  } catch (err) {
    console.error('❌ TEST 16 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 17: Audit events are generated
  // -------------------------------------------------------------------------
  try {
    const audits = await pool.request().query(`
      SELECT TOP 50 Action, Module, RecordID, ActorName, Source
      FROM dbo.AuditEvent
      WHERE Module = 'Documents' OR Action IN ('UPLOAD_DOCUMENT', 'UPLOAD_DOCUMENT_VERSION', 'BULK_UPLOAD_DOCUMENTS', 'DOWNLOAD_DOCUMENT', 'UNAUTHORIZED_DOCUMENT_ACCESS')
      ORDER BY AuditID DESC;
    `);

    const actions = audits.recordset.map((a) => a.Action);
    const hasUpload = actions.includes('UPLOAD_DOCUMENT');
    const hasVersion = actions.includes('UPLOAD_DOCUMENT_VERSION');
    const hasBulk = actions.includes('BULK_UPLOAD_DOCUMENTS');
    const hasUnauth = actions.includes('UNAUTHORIZED_DOCUMENT_ACCESS');

    if (hasUpload && hasVersion && hasBulk && hasUnauth) {
      console.log('✔ TEST 17 PASSED: Audit trail verified with UPLOAD, VERSION, BULK, and UNAUTHORIZED events');
      passedCount++;
    } else {
      console.error('❌ TEST 17 FAILED: Missing audit actions:', { actions, hasUpload, hasVersion, hasBulk, hasUnauth });
    }
  } catch (err) {
    console.error('❌ TEST 17 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 18: Signature history is preserved
  // -------------------------------------------------------------------------
  try {
    // Sign version 2 of general doc
    const signRes = await post(
      `/documents/${version2DocId}/sign`,
      {
        signatureData: 'data:image/png;base64,mockEmployeeSignatureV2',
      },
      empSaudi.token,
    );

    const sigRows = await pool.request().query(`
      SELECT SignatureID, DocumentID, SignerName, SignerRole, VerificationHash
      FROM dbo.SignatureEvent
      WHERE DocumentID = ${version2DocId}
      ORDER BY SignatureID DESC;
    `);

    if (sigRows.recordset.length > 0 && sigRows.recordset[0].VerificationHash) {
      console.log('✔ TEST 18 PASSED: Document signature history preserved with SHA-256 hash');
      passedCount++;
    } else {
      console.error('❌ TEST 18 FAILED:', sigRows.recordset);
    }
  } catch (err) {
    console.error('❌ TEST 18 ERROR:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 19: Backend build passes
  // -------------------------------------------------------------------------
  try {
    console.log('Verifying NestJS backend build...');
    execSync('npm run build', { cwd: 'c:\\Users\\TejaswiniAppBRI\\Downloads\\EICS DUP\\backend', stdio: 'pipe' });
    console.log('✔ TEST 19 PASSED: Backend NestJS build compiles with zero errors');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 19 FAILED: Backend build error:', err.message);
  }

  // -------------------------------------------------------------------------
  // TEST 20: Frontend build passes
  // -------------------------------------------------------------------------
  try {
    console.log('Verifying Vite frontend build...');
    execSync('npm run build', { cwd: 'c:\\Users\\TejaswiniAppBRI\\Downloads\\EICS DUP\\frontend', stdio: 'pipe' });
    console.log('✔ TEST 20 PASSED: Frontend Vite build compiles with zero errors');
    passedCount++;
  } catch (err) {
    console.error('❌ TEST 20 FAILED: Frontend build error:', err.message);
  }

  console.log('\n================================================================');
  console.log(`SECTION 6 VERIFICATION SUMMARY: ${passedCount} / ${totalTests} PASSED`);
  if (passedCount === totalTests) {
    console.log('STATUS: ALL 20 CRITICAL SECTION 6 TESTS PASSED (100% SUCCESS)');
  } else {
    console.log(`STATUS: ${totalTests - passedCount} TESTS FAILED`);
  }
  console.log('================================================================');

  await pool.close();
}

runSection6Verification().catch((err) => {
  console.error('Verification execution error:', err);
  process.exit(1);
});
