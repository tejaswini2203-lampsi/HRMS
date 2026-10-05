const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACTS_DIR = 'C:\\Users\\TejaswiniAppBRI\\.gemini\\antigravity-ide\\brain\\6fca0f63-b8e0-4c6a-afb7-4797d13da415';
const SCREENSHOTS_DIR = path.join(ARTIFACTS_DIR, 'screenshots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Login
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await page.type('#login-username', 'admin@eicscomp.com');
  await page.type('#login-password', 'eics@4321');
  await page.click('button[type="submit"]');
  await sleep(1500);

  // 1. Work Queue - Completed History Tab
  await page.goto('http://localhost:5173/work-queue', { waitUntil: 'networkidle2' });
  await sleep(1500);

  console.log('Switching to Completed History tab...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.wq-tab'));
    const compTab = tabs.find(t => t.textContent.includes('Completed History'));
    if (compTab) compTab.click();
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05_completed_history_tab.png') });
  console.log('📸 Saved 05_completed_history_tab.png');

  // Click on one of the completed tasks (e.g. Mudasiir or Saleem) to view its modal in completed state
  const clickedCompTask = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const mudasiirCard = cards.find(c => c.textContent.includes('Mudasiir') && c.textContent.includes('Duration'));
    if (mudasiirCard) {
      const btn = mudasiirCard.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (clickedCompTask) {
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06_completed_task_modal_with_persisted_history.png') });
    console.log('📸 Saved 06_completed_task_modal_with_persisted_history.png');

    // Switch to Workflow History tab in modal
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const histTab = tabs.find(t => t.textContent.includes('History'));
      if (histTab) histTab.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '07_completed_task_workflow_history_tab.png') });
    console.log('📸 Saved 07_completed_task_workflow_history_tab.png');

    // Close modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.modal-close');
      if (closeBtn) closeBtn.click();
    });
    await sleep(600);
  }

  // 2. Open an active task for UAE Visa (e.g. Saleem - Pending Employee Signature)
  console.log('Switching to To Do tab and opening Saleem - Pending Employee Signature...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.wq-tab'));
    const todoTab = tabs.find(t => t.textContent.includes('To Do'));
    if (todoTab) todoTab.click();
  });
  await sleep(1500);

  await page.focus('.wq-search-input');
  await page.type('.wq-search-input', 'Saleem');
  await sleep(1000);

  const clickedSaleem = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.task-card'));
    const card = cards.find(c => c.textContent.includes('Saleem') && c.textContent.includes('Signature'));
    if (card) {
      const btn = card.querySelector('button');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (clickedSaleem) {
    await sleep(1500);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '08_uae_active_task_modal.png') });
    console.log('📸 Saved 08_uae_active_task_modal.png');

    // Switch to Documents & Checklist tab
    await page.evaluate(() => {
      const tabs = Array.from(document.querySelectorAll('.task-modal-tab'));
      const docTab = tabs.find(t => t.textContent.includes('Documents'));
      if (docTab) docTab.click();
    });
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '09_uae_documents_and_checklist_in_modal.png') });
    console.log('📸 Saved 09_uae_documents_and_checklist_in_modal.png');
  }

  await browser.close();
  console.log('Done!');
}

run().catch(console.error);
