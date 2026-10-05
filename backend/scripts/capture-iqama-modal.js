const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
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
  const caseId = caseRes.data.CaseID;
  console.log('Created Case:', caseId);

  const pool = await sql.connect({ connectionString: CONNECTION });
  const t1 = await pool
    .request()
    .query(
      `SELECT TaskID FROM dbo.WorkQueueTask WHERE SourceModule = 'Compliance' AND SourceID = '${caseId}' AND ActionKey = 'EXPIRY_DETECTED'`,
    );
  const t1Id = t1.recordset[0].TaskID;

  // Advance to HOD_DURATION
  await post(`/work-queue/tasks/${t1Id}/execute`, { action: 'CONFIRM', comments: 'Expiry verified by HR' }, hrToken);

  const t2 = await pool
    .request()
    .query(
      `SELECT TaskID, Title FROM dbo.WorkQueueTask WHERE SourceModule = 'Compliance' AND SourceID = '${caseId}' AND ActionKey = 'HOD_DURATION'`,
    );
  const hodTaskId = t2.recordset[0].TaskID;
  console.log('HOD Duration Task ID:', hodTaskId);

  // Now launch browser to open this task and take screenshots
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await page.type('#login-username', 'admin@eicscomp.com');
  await page.type('#login-password', 'eics@4321');
  await page.click('button[type="submit"]');
  await sleep(1500);

  await page.goto('http://localhost:5173/work-queue', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // Filter or search
  await page.focus('.wq-search-input');
  await page.type('.wq-search-input', 'Duration');
  await sleep(1000);

  // Click "Select Duration" card
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.task-card')).find((c) =>
      c.textContent.includes('Duration Confirmation'),
    );
    if (card) card.querySelector('button').click();
  });
  await sleep(2000);

  const SCREENSHOTS_DIR =
    'C:\\Users\\TejaswiniAppBRI\\.gemini\\antigravity-ide\\brain\\6fca0f63-b8e0-4c6a-afb7-4797d13da415\\screenshots';

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '17_ksa_iqama_duration_selection_modal.png') });
  console.log('📸 Saved 17_ksa_iqama_duration_selection_modal.png');

  // Select 6 Months
  await page.evaluate(() => {
    const r = document.querySelector('input[type="radio"][value="6"]');
    if (r) {
      r.click();
      r.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await sleep(500);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '18_ksa_iqama_duration_6m_selected.png') });
  console.log('📸 Saved 18_ksa_iqama_duration_6m_selected.png');

  // Click Submit
  await page.evaluate(() => {
    const btn = document.querySelector('.task-modal-actions button.btn--primary');
    if (btn) btn.click();
  });
  await sleep(2500);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '19_ksa_iqama_duration_confirmed_toast.png') });
  console.log('📸 Saved 19_ksa_iqama_duration_confirmed_toast.png');

  // Reload page to verify persistence
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1500);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '20_work_queue_persisted_after_refresh.png') });
  console.log('📸 Saved 20_work_queue_persisted_after_refresh.png');

  await browser.close();
  await pool.close();
  console.log('All done!');
}

main().catch(console.error);
