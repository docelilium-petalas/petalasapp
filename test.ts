import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Log all console messages
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));

  console.log('Navigating to /auth...');
  await page.goto('http://localhost:3000/auth');
  
  console.log('Filling login form...');
  await page.fill('input[type="email"]', process.env.TEST_EMAIL ?? '')
  await page.fill('input[type="password"]', process.env.TEST_PASSWORD ?? '')
  await page.click('button[type="submit"]');

  console.log('Waiting for redirect to /dashboard...');
  await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(e => console.log('Timeout waiting for redirect', e));
  
  console.log('Waiting 5 seconds on dashboard to catch errors...');
  await page.waitForTimeout(5000);

  await browser.close();
  console.log('Done.');
})();
