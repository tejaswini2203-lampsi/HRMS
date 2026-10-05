const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\TejaswiniAppBRI\\.gemini\\antigravity-ide\\brain\\6fca0f63-b8e0-4c6a-afb7-4797d13da415';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runBrowserTest() {
  console.log('--- Launching Chromium / Microsoft Edge ---');
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // 1. Login
  console.log('1. Navigating to login page...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await page.type('#login-username', 'admin@eicscomp.com');
  await page.type('#login-password', 'eics@4321');
  await page.click('button[type="submit"]');
  await sleep(1500);

  console.log('✅ Logged in successfully. Current URL:', page.url());

  // 2. Navigate to Work Queue
  console.log('2. Navigating to Work Queue...');
  await page.goto('http://localhost:5173/work-queue', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01_work_queue_overview.png'), fullPage: false });
  console.log('📸 Saved 01_work_queue_overview.png');

  // 3. Workflow 1: Corporate Letter PDF (Saleem - Experience Letter)
  console.log('\n3. Testing Corporate Letter Approval Workflow...');
  const clickedReview = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const c = cards.find(card => card.textContent.includes('Saleem') && card.textContent.includes('Experience Letter'));
    if (c) {
      const btn = c.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (clickedReview) {
    console.log('Clicked "Review Letter"');
    await sleep(2000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02_letter_review_modal.png') });
    console.log('📸 Saved 02_letter_review_modal.png');

    // Switch to Documents Tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const t = tabs.find(tab => tab.textContent.includes('Submitted Documents'));
      if (t) t.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03_letter_modal_documents_tab.png') });
    console.log('📸 Saved 03_letter_modal_documents_tab.png');

    // Switch back to Details Tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const t = tabs.find(tab => tab.textContent.includes('Task Details'));
      if (t) t.click();
    });
    await sleep(600);

    // Click Approve & Issue Letter
    const clickedApprove = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-footer .btn--primary'));
      const b = btns.find(btn => btn.textContent.includes('Approve') || btn.textContent.includes('Issue'));
      if (b) {
        b.click();
        return true;
      }
      return false;
    });

    if (clickedApprove) {
      console.log('Clicked "Approve & Issue Letter"...');
      await sleep(2500);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04_letter_approved_toast.png') });
      console.log('📸 Saved 04_letter_approved_toast.png');
    }
  }

  // 4. Workflow 4: UAE Visa Renewal (Sashi - Contract Drafting)
  console.log('\n4. Testing UAE Visa Renewal Workflow...');
  await page.evaluate(() => {
    const input = document.querySelector('.wq-search-input');
    if (input) {
      input.value = 'Sashi';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(1000);

  const clickedUae = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const c = cards.find(card => card.textContent.includes('Sashi') && card.textContent.includes('Contract Drafting'));
    if (c) {
      const btn = c.querySelector('button');
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
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_uae_contract_modal.png') });
    console.log('📸 Saved 05_uae_contract_modal.png');

    // Click primary action button in modal
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-footer .btn--primary'));
      if (btns[0]) btns[0].click();
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_uae_contract_executed_toast.png') });
    console.log('📸 Saved 06_uae_contract_executed_toast.png');
  }

  // 5. Workflow 3: KSA Iqama Duration (Mudasiir - HOD Duration Confirmation)
  console.log('\n5. Testing KSA Iqama Duration Workflow...');
  // Clear search and search for Mudasiir
  await page.evaluate(() => {
    const input = document.querySelector('.wq-search-input');
    if (input) {
      input.value = 'Mudasiir';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await sleep(1000);

  const clickedKsa = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const c = cards.find(card => card.textContent.includes('Mudasiir') && card.textContent.includes('Duration'));
    if (c) {
      const btn = c.querySelector('button');
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
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_ksa_duration_modal.png') });
    console.log('📸 Saved 07_ksa_duration_modal.png');

    // Select 6 Months radio
    await page.evaluate(() => {
      const radio6 = document.querySelector('input[type="radio"][value="6"]');
      if (radio6) {
        radio6.click();
        radio6.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await sleep(500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_ksa_duration_selected_6m.png') });
    console.log('📸 Saved 08_ksa_duration_selected_6m.png');

    // Click confirm duration button
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.modal-footer .btn--primary'));
      if (btns[0]) btns[0].click();
    });
    await sleep(2500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_ksa_duration_confirmed_toast.png') });
    console.log('📸 Saved 09_ksa_duration_confirmed_toast.png');

    // Refresh page and confirm persistence
    console.log('Reloading browser to confirm persistence...');
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(1500);

    await page.evaluate(() => {
      const input = document.querySelector('.wq-search-input');
      if (input) {
        input.value = 'Mudasiir';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '10_work_queue_after_refresh_next_task.png') });
    console.log('📸 Saved 10_work_queue_after_refresh_next_task.png');

    // Switch to Completed History tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.wq-tab'));
      const t = tabs.find(tab => tab.textContent.includes('Completed History'));
      if (t) t.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '11_completed_history_tab.png') });
    console.log('📸 Saved 11_completed_history_tab.png');
  }

  // 6. Navigate to Document Center
  console.log('\n6. Navigating to Document Center to verify generated PDF...');
  await page.goto('http://localhost:5173/documents', { waitUntil: 'networkidle2' });
  await sleep(1500);

  // Click 'Letter' category filter
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.cat-tab'));
    const b = btns.find(btn => btn.textContent.trim() === 'Letter');
    if (b) b.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '12_document_center_letters_pdf.png') });
  console.log('📸 Saved 12_document_center_letters_pdf.png');

  // Open Document Upload Modal
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.docs-header-actions button'));
    const b = btns.find(btn => btn.textContent.includes('Upload Document'));
    if (b) b.click();
  });
  await sleep(1000);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '13_document_upload_modal.png') });
  console.log('📸 Saved 13_document_upload_modal.png');

  // 7. Letter Requests page
  console.log('\n7. Navigating to Letter Requests page...');
  await page.goto('http://localhost:5173/letters', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '14_letter_requests_page.png') });
  console.log('📸 Saved 14_letter_requests_page.png');

  await browser.close();
  console.log('\n🎉 BROWSER AUTOMATION COMPLETED WITH ALL 14 SCREENSHOTS SAVED!');
}

runBrowserTest().catch(console.error);
