const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
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

  await page.focus('.wq-search-input');
  await page.type('.wq-search-input', 'Saleem');
  await sleep(1000);

  // Click card
  await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll('.task-card')).find(
      (c) => c.textContent.includes('Saleem') && c.textContent.includes('Signature'),
    );
    if (card) card.querySelector('button').click();
  });
  await sleep(1500);

  // Click Documents & Checklist tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.modal-tab-btn'));
    const t = tabs.find((tab) => tab.textContent.includes('Checklist') || tab.textContent.includes('Documents'));
    if (t) t.click();
  });
  await sleep(1000);

  const SCREENSHOTS_DIR =
    'C:\\Users\\TejaswiniAppBRI\\.gemini\\antigravity-ide\\brain\\6fca0f63-b8e0-4c6a-afb7-4797d13da415\\screenshots';

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '15_uae_checklist_and_documents_tab.png') });

  // Click Workflow History tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.modal-tab-btn'));
    const t = tabs.find((tab) => tab.textContent.includes('History'));
    if (t) t.click();
  });
  await sleep(1000);

  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '16_uae_workflow_history_tab.png') });

  await browser.close();
  console.log('Saved screenshots 15 and 16 successfully!');
}

run().catch(console.error);
