import QRCode from 'qrcode';
import { createIcons, Download, Printer } from 'lucide';
import { tableText, passUrl, csv } from './domain.js';
import { saveGuestPass } from './pass-image.js';

const data = JSON.parse(document.querySelector('#pass-data').textContent);
const root = document.querySelector('#pass-tools');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => '<i data-lucide="' + name + '" aria-hidden="true"></i>';
function download(content, type, name) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const printCss = `body{font:16px Arial;color:#171717;margin:20px}*{box-sizing:border-box}h1{font:30px Georgia}.print-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.print-pass{border:1px solid #d5c9a9;border-top:3px solid #936d20;text-align:center;padding:16px;break-inside:avoid;min-height:320px}.print-brand{font:22px Georgia;color:#936d20}.print-pass h3{font-size:16px;overflow-wrap:anywhere}.print-pass p{font-size:13px}.print-pass img{display:block;width:160px;height:160px;margin:auto}.print-pass strong{display:block;color:#936d20;margin:8px}.pass-download,.print-toolbar,.print-progress{display:none}@media print{@page{size:A4;margin:10mm}body{margin:0}h1{display:none}.print-grid{display:block}.print-pass{display:inline-block;vertical-align:top;width:48%;margin:0 1% 6mm;min-height:86mm}.print-pass img{width:38mm;height:38mm}}`;

async function render() {
  root.innerHTML = '<div class="print-toolbar"><h2>Guest passes</h2><div class="public-actions">' +
    '<button class="button" id="download-print" disabled>' + icon('printer') + 'Download printable passes</button>' +
    '<button class="button" id="export-links">' + icon('download') + 'Invitation links CSV</button></div></div>' +
    '<p class="print-progress" role="status">Preparing QR codes...</p><div class="print-grid"></div>';
  createIcons({ icons: { Download, Printer } });
  document.querySelector('#export-links').addEventListener('click', () => {
    download(csv([['Full Name', 'Local Congregation', 'Role', 'Table', 'Personal Invitation Link'],
      ...data.guests.map(g => [g.name, g.congregation, g.role, tableText(g.table), passUrl(g.token, data.siteUrl)])]),
    'text/csv;charset=utf-8', 'kadiwa-invitation-links.csv');
  });
  const grid = document.querySelector('.print-grid');
  for (const g of data.guests) {
    const url = passUrl(g.token, data.siteUrl);
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 4, errorCorrectionLevel: 'M' });
    const item = document.createElement('article');
    item.className = 'print-pass';
    item.innerHTML = '<div class="print-brand">KADIWA FORMAL 2026</div><h3>' + escape(g.name) +
      '</h3><p>' + escape(g.congregation) + ' · ' + escape(g.role) + '</p><strong>' + escape(tableText(g.table)) +
      '</strong><img src="' + qr + '" alt="Personal QR pass" width="160" height="160">' +
      '<p>October 4, 2026 · 5:00 PM<br>The Legacy @ One North</p>' +
      '<button class="button pass-download">' + icon('download') + 'Save pass</button>';
    const button = item.querySelector('button');
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await saveGuestPass(g, url); }
      catch { document.querySelector('.print-progress').textContent = 'Pass download failed. Please try again.'; }
      finally { button.disabled = false; }
    });
    grid.append(item);
  }
  document.querySelector('.print-progress').textContent = data.guests.length + ' passes ready';
  const button = document.querySelector('#download-print');
  button.disabled = false;
  button.addEventListener('click', () => {
    const copy = grid.cloneNode(true);
    copy.querySelectorAll('button').forEach(el => el.remove());
    download('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KADIWA guest passes</title><style>' +
      printCss + '</style></head><body><h1>KADIWA Formal guest passes</h1>' + copy.outerHTML + '</body></html>',
      'text/html;charset=utf-8', 'kadiwa-printable-passes.html');
  });
  createIcons({ icons: { Download, Printer } });
}
render().catch(() => { root.innerHTML = '<p role="alert">Could not prepare passes. Close this window and try again from the spreadsheet menu.</p>'; });
