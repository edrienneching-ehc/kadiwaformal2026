import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173/';
const artifacts = new URL('../test-results/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let executablePath = process.env.CHROME_EXECUTABLE;
if (!executablePath && process.platform === 'darwin') {
  const path = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  try { await access(path); executablePath = path; } catch {}
}
const browser = await chromium.launch({ executablePath, headless: true });
const errors = [];
try {
  for (const width of [1440, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '?demo=1');
    await page.getByRole('heading', { name: 'Alex Santos', exact: true }).waitFor();
    await page.locator('#guest-qr').evaluate(img => img.decode());
    assert.equal(await page.locator('img').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth > 0)), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `guest overflow at ${width}`);
    await page.screenshot({ path: fileURLToPath(new URL(`guest-${width}.png`, artifacts)), fullPage: true });
    await page.getByRole('button', { name: 'Program', exact: true }).click();
    await page.getByText('The full program will be posted soon.').waitFor();
    await page.getByRole('button', { name: 'Reminders', exact: true }).click();
    await page.getByRole('heading', { name: 'Photos and videos', exact: true }).waitFor();
    await page.getByText('Please arrive on time for the 5:00 PM start.', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Getting there', exact: true }).waitFor();
    await page.getByText('From One-North MRT', { exact: true }).click();
    await page.getByText('Continue until you reach No. 11, NTU@one-north.', { exact: true }).waitFor();
    await page.getByText('From Buona Vista MRT', { exact: true }).click();
    await page.getByText('At Buona Vista MRT, take Exit D.', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `directions overflow at ${width}`);
    for (const link of await page.locator('.guide-link').all()) {
      const response = await page.request.get(new URL(await link.getAttribute('href'), base).href);
      assert.equal(response.status(), 200);
      assert.equal((await response.body()).subarray(0, 5).toString(), '%PDF-');
    }
    await page.screenshot({ path: fileURLToPath(new URL(`directions-${width}.png`, artifacts)), fullPage: true });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '?demo=1&view=admin');
  await page.getByLabel('Your name', { exact: true }).fill('Test Volunteer');
  await page.getByLabel('Volunteer password', { exact: true }).fill('sample-preview');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Check in Alex Santos', exact: true }).waitFor();
  await page.screenshot({ path: fileURLToPath(new URL('volunteer-desktop.png', artifacts)), fullPage: true });
  await page.getByRole('button', { name: 'Check in Alex Santos', exact: true }).click();
  await page.getByText('CHECK-IN COMPLETE', { exact: true }).waitFor();
  const checkedRow = page.getByRole('row').filter({ hasText: 'Alex Santos' });
  assert.equal(await checkedRow.getByRole('button', { name: 'Already checked in', exact: true }).isDisabled(), true);
  await page.getByLabel('Search guests').fill('north');
  assert.equal(await page.locator('#roster tr').count(), 2);
  await page.getByRole('button', { name: 'Arrived', exact: true }).click();
  assert.equal(await page.getByText('No matching guests.').isVisible(), true);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByLabel('Search guests').fill('');
  await page.getByRole('button', { name: 'View pass for Sam Rivera', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('Registration desk · North').waitFor();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Print passes', exact: true }).click();
  await page.getByText('6 passes ready', { exact: true }).waitFor();
  assert.equal(await page.locator('.print-pass').count(), 6);
  // Decode a generated pass through the same image-scanning path volunteers use.
  const dataUrl = await page.locator('.print-pass').first().locator('img').getAttribute('src');
  const qrPath = fileURLToPath(new URL('qr-sample.png', artifacts));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(qrPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
  await page.screenshot({ path: fileURLToPath(new URL('print-passes.png', artifacts)), fullPage: true });
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Upload QR image').setInputFiles(qrPath);
  await page.getByText('ALREADY CHECKED IN', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Invitation links CSV', exact: true }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), 'kadiwa-invitation-links.csv');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `admin overflow at ${width}`);
    await page.screenshot({ path: fileURLToPath(new URL(`volunteer-${width}.png`, artifacts)), fullPage: true });
  }
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Volunteer sign-in', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('kadiwa-session')), null);
  await page.goto(base + '?pass=bad');
  await page.getByRole('heading', { name: 'Guest pass unavailable', exact: true }).waitFor();
  await page.goto(base);
  await page.getByRole('heading', { name: 'A seat at the celebration', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: desktop/mobile, images, guest views, login, check-in, repeat QR image scan, exports, print passes, logout, and unconfigured state.');
} finally { await browser.close(); }
