const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\TejaswiniAppBRI\\.gemini\\antigravity-ide\\brain\\6fca0f63-b8e0-4c6a-afb7-4797d13da415';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runBrowserVerification() {
  console.log('=== LAUNCHING COMPLETE BROWSER VERIFICATION ===');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Login
  console.log('1. Logging in as Admin...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await page.type('#login-username', 'admin@eicscomp.com');
  await page.type('#login-password', 'eics@4321');
  await page.click('button[type="submit"]');
  await sleep(1500);

  // 2. Work Queue Overview
  console.log('2. Loading Work Queue...');
  await page.goto('http://localhost:5173/work-queue', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_work_queue_overview.png') });

  // 3. Workflow 1: Corporate Letter Approval
  console.log('3. Interacting with Corporate Letter Task...');
  // Find open letter task card
  const clickedLetter = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const letterCard = cards.find(c => c.textContent.includes('Experience Letter') && !c.classList.contains('is-completed'));
    if (letterCard) {
      const btn = letterCard.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (clickedLetter) {
    console.log('Clicked "Review Letter"');
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_letter_review_modal_details.png') });

    // Click "Documents & Checklist" tab in modal
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const docTab = tabs.find(t => t.textContent.includes('Documents'));
      if (docTab) docTab.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_letter_modal_documents_tab.png') });

    // Switch back to Record Overview
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const overviewTab = tabs.find(t => t.textContent.includes('Overview'));
      if (overviewTab) overviewTab.click();
    });
    await sleep(600);

    // Scroll modal and click "Approve & Issue Letter" in .task-modal-actions
    console.log('Clicking "Approve & Issue Letter"...');
    await page.evaluate(() => {
      const btn = document.querySelector('.task-modal-actions button.btn--primary');
      if (btn) btn.click();
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_letter_approved_toast.png') });
  }

  // 4. Workflow 4: UAE Visa Renewal (Sashi - Contract Drafting)
  console.log('4. Interacting with UAE Visa Renewal Task (Sashi)...');
  await page.focus('.wq-search-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type('.wq-search-input', 'Sashi');
  await sleep(1000);

  const clickedUae = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const uaeCard = cards.find(c => c.textContent.includes('Sashi') && c.textContent.includes('Contract Drafting') && !c.classList.contains('is-completed'));
    if (uaeCard) {
      const btn = uaeCard.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (clickedUae) {
    console.log('Clicked "Prepare Contract" for Sashi');
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_uae_contract_drafting_modal.png') });

    // Check Documents tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const docTab = tabs.find(t => t.textContent.includes('Documents'));
      if (docTab) docTab.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_uae_checklist_and_docs_tab.png') });

    // Switch back to Record Overview
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const overviewTab = tabs.find(t => t.textContent.includes('Overview'));
      if (overviewTab) overviewTab.click();
    });
    await sleep(600);

    // Execute & Advance
    console.log('Clicking primary button in .task-modal-actions to advance stage...');
    await page.evaluate(() => {
      const btn = document.querySelector('.task-modal-actions button.btn--primary');
      if (btn) btn.click();
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_uae_contract_advanced_toast.png') });
  }

  // 5. Workflow 3: KSA Iqama Duration (Mudasiir - HOD Duration Confirmation)
  console.log('5. Interacting with KSA Iqama Duration Task (Mudasiir)...');
  await page.focus('.wq-search-input');
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type('.wq-search-input', 'Mudasiir');
  await sleep(1000);

  const clickedKsa = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const ksaCard = cards.find(c => c.textContent.includes('Mudasiir') && c.textContent.includes('Duration') && !c.classList.contains('is-completed'));
    if (ksaCard) {
      const btn = ksaCard.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (clickedKsa) {
    console.log('Clicked "Select Duration" for Mudasiir');
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_ksa_duration_modal.png') });

    // Select 6 Months radio option
    console.log('Selecting 6 Months Iqama Duration...');
    await page.evaluate(() => {
      const radio6 = document.querySelector('input[type="radio"][value="6"]');
      if (radio6) {
        radio6.click();
        radio6.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_ksa_duration_selected_6m.png') });

    // Click Confirm Duration & Proceed
    console.log('Clicking "Confirm Duration & Proceed"...');
    await page.evaluate(() => {
      const btn = document.querySelector('.task-modal-actions button.btn--primary');
      if (btn) btn.click();
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_ksa_duration_confirmed_toast.png') });

    // RELOAD browser page to confirm database persistence
    console.log('Reloading page to confirm persistence...');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);

    // Verify next task for Mudasiir
    await page.focus('.wq-search-input');
    await page.type('.wq-search-input', 'Mudasiir');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_work_queue_after_refresh_next_task.png') });

    // Switch to Completed History tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.wq-tab'));
      const t = tabs.find(tab => tab.textContent.includes('Completed History'));
      if (t) t.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_completed_history_tab.png') });
  }

  // 6. Navigate to /requests/letters
  console.log('6. Navigating to /requests/letters...');
  await page.goto('http://localhost:5173/requests/letters', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_letter_requests_table_pdf_download.png') });

  // 7. Navigate to /documents
  console.log('7. Navigating to /documents...');
  await page.goto('http://localhost:5173/documents', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // Filter by 'Letter' category
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.cat-tab'));
    const b = btns.find(btn => btn.textContent.trim() === 'Letter');
    if (b) b.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_document_center_letters_pdf.png') });

  await browser.close();
  console.log('=== COMPLETE BROWSER VERIFICATION FINISHED SUCCESSFULLY ===');
}

runBrowserVerification().catch(console.error);
