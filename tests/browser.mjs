import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, access, readFile } from 'node:fs/promises';
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
    assert.equal(await page.getByRole('link', { name: 'Volunteers' }).count(), 0);
    await page.screenshot({ path: fileURLToPath(new URL(`guest-${width}.png`, artifacts)), fullPage: true });
    await page.getByRole('button', { name: "I'm here", exact: true }).click();
    await page.getByText('You are checked in. Enjoy the evening!', { exact: true }).waitFor();
    assert.equal(await page.locator('#self-check-in').count(), 0);
    const arrival = await page.locator('.attendance-label').textContent();
    await page.getByRole('button', { name: 'Refresh guest pass', exact: true }).click();
    await page.getByText('You are checked in. Enjoy the evening!', { exact: true }).waitFor();
    assert.equal(await page.locator('.attendance-label').textContent(), arrival);
    const savedPass = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save pass', exact: true }).click();
    assert.equal((await savedPass).suggestedFilename(), 'kadiwa-pass-Alex-Santos.png');
    await page.screenshot({ path: fileURLToPath(new URL(`checked-in-${width}.png`, artifacts)), fullPage: true });
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
  await page.goto(base + '?demo=1&pass=' + '3'.repeat(64));
  await page.getByRole('heading', { name: 'Sam Rivera', exact: true }).waitFor();
  await page.getByText('Registration desk', { exact: true }).waitFor();
  await page.getByRole('button', { name: "I'm here", exact: true }).click();
  await page.getByText('You are checked in. Enjoy the evening!', { exact: true }).waitFor();
  await page.goto(base + '?demo=1&view=admin');
  await page.getByRole('heading', { name: 'Alex Santos', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Volunteer sign-in' }).count(), 0);

  const fixtureUrl = new URL('__pass-tools-test', base).href;
  const fixture = { siteUrl: base, guests: [
    { name: 'Sample Guest', congregation: 'East', role: 'Attendee', table: 4, token: '1'.repeat(64) },
    { name: '<b>Sample Performer</b>', congregation: 'North', role: 'Performer', table: 0, token: '3'.repeat(64) }
  ] };
  await page.route(fixtureUrl, route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html><head><link rel="stylesheet" href="' + base + 'assets/style.css"></head><body class="pass-tools"><main id="pass-tools"></main>' +
    '<script id="pass-data" type="application/json">' + JSON.stringify(fixture).replaceAll('<', '\\u003c') +
    '</script><script type="module" src="' + base + 'assets/pass-tools.js"></script></body></html>' }));
  await page.goto(fixtureUrl);
  await page.getByText('2 passes ready', { exact: true }).waitFor();
  assert.equal(await page.locator('.print-pass').count(), 2);
  assert.equal(await page.locator('.print-pass h3 b').count(), 0);
  await page.locator('.print-pass img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
  await page.screenshot({ path: fileURLToPath(new URL('private-pass-tools.png', artifacts)), fullPage: true });
  const exportPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Invitation links CSV', exact: true }).click();
  assert.equal((await exportPromise).suggestedFilename(), 'kadiwa-invitation-links.csv');
  const printPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download printable passes', exact: true }).click();
  const printable = await printPromise;
  const printablePath = fileURLToPath(new URL('sample-printable-passes.html', artifacts));
  await printable.saveAs(printablePath);
  const printableHtml = await readFile(printablePath, 'utf8');
  assert.ok(printableHtml.includes('data:image/png;base64,'));
  assert.ok(!printableHtml.includes('<button'));
  const pngPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save pass', exact: true }).first().click();
  assert.equal((await pngPromise).suggestedFilename(), 'kadiwa-pass-Sample-Guest.png');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `private pass tools overflow at ${width}`);
  }
  await page.goto(base + '?pass=bad');
  await page.getByRole('heading', { name: 'Guest pass unavailable', exact: true }).waitFor();
  await page.goto(base);
  await page.getByRole('heading', { name: 'A seat at the celebration', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: desktop/mobile, guest self-check-in, repeat refresh, table-zero guests, QR images, pass downloads, private exports and printable passes, directions and unconfigured state.');
} finally { await browser.close(); }
