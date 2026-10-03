import { createIcons, CalendarDays, MapPin, Ticket, Clock, Info, ShieldCheck, Camera, CameraOff, Search, Check, RefreshCw, Download, Printer, LogOut, X, ImageUp, Link, ChevronDown, LoaderCircle } from 'lucide';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import config from '../site-config.json';
import { call, isDemo } from './api.js';
import { tableText, extractToken, passUrl, csv, filteredGuests } from './domain.js';

const icons = { CalendarDays, MapPin, Ticket, Clock, Info, ShieldCheck, Camera, CameraOff, Search, Check, RefreshCw, Download, Printer, LogOut, X, ImageUp, Link, ChevronDown, LoaderCircle };
const params = new URLSearchParams(location.search);
const app = document.querySelector('#app');
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const dateText = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(config.startsAt));
const timeText = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(config.startsAt));
const formatTime = date => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(date));
const state = { view: params.get('view') === 'admin' ? 'admin' : 'pass', guest: null, guests: [], query: '', filter: 'all', session: sessionStorage.getItem('kadiwa-session') || '', volunteer: sessionStorage.getItem('kadiwa-volunteer') || '', busy: false };
let scanner;
let scannerRunning = false;
let scannerBusy = false;
let polling;
let toastTimer;
let lastFocused;

function paintIcons() { createIcons({ icons, attrs: { 'stroke-width': 1.6 } }); }
function announce(message, isError = false) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.className = `visible ${isError ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = ''; }, 6000);
}
function demoLink(view = '') {
  const url = new URL(location.href);
  url.search = '';
  if (isDemo()) url.searchParams.set('demo', '1');
  if (view) url.searchParams.set('view', view);
  return url.href;
}
function guestLink(token) {
  const url = new URL(passUrl(token, isDemo() ? new URL('./', location.href).href : config.siteUrl));
  if (isDemo()) url.searchParams.set('demo', '1');
  return url.href;
}
function drawShell() {
  app.innerHTML = `${isDemo() ? '<div class="preview-strip">Preview · sample guests · attendance is not saved</div>' : ''}
    <header class="site-header"><a class="wordmark" href="${e(demoLink())}" aria-label="KADIWA Formal home">KADIWA <span>FORMAL</span></a>
      <span class="header-district">${e(config.district)}</span><a class="staff-link ${state.view === 'admin' ? 'active' : ''}" href="${e(demoLink('admin'))}">${icon('shield-check')}<span>Volunteers</span></a></header>
    <main id="main" class="${state.view === 'admin' ? 'admin-main' : 'guest-main'}"></main>
    <footer class="site-footer"><span>KADIWA · ${e(config.district)}</span><span>October 4, 2026</span></footer>`;
  paintIcons();
}
function eventHeader() {
  return `<div class="event-heading"><p class="eyebrow">${e(config.district)} · 2026</p><h1>KADIWA <span>Formal</span></h1><div class="event-facts"><span>${icon('calendar-days')}${e(dateText)} · ${e(timeText)}</span><span>${icon('map-pin')}${e(config.venue)}</span></div></div>`;
}
function renderGuest() {
  document.querySelector('#main').innerHTML = `<div class="guest-content">${eventHeader()}
    <nav class="tabs" aria-label="Event information">${[['pass', 'ticket', 'My Pass'], ['program', 'clock', 'Program'], ['reminders', 'info', 'Reminders']].map(([view, glyph, text]) => `<button class="tab ${state.view === view ? 'selected' : ''}" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ''}>${icon(glyph)}${text}</button>`).join('')}</nav>
    <section id="guest-panel" class="guest-panel" aria-live="polite"></section></div>
    <aside class="invitation"><img src="./assets/banner.jpg" alt="KADIWA Formal invitation, District of Singapore. October 4, 2026, 5:00 PM, The Legacy @ One North." width="904" height="1280"><span>THE OFFICIAL INVITATION</span></aside>`;
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => {
    state.view = button.dataset.view;
    renderGuest();
    if (state.view === 'pass') await renderPass();
    else if (state.view === 'program') renderProgram();
    else renderReminders();
  }));
  paintIcons();
}
async function renderPass() {
  const panel = document.querySelector('#guest-panel');
  if (!panel) return;
  let token = params.get('pass');
  if (isDemo() && !token) token = '1'.repeat(64);
  if (!token) {
    panel.innerHTML = `<div class="empty-pass"><div class="stamp">${icon('ticket')}</div><p class="eyebrow">YOUR INVITATION</p><h2>A seat at the celebration</h2><p>Your personal guest pass will appear here when you open your invitation link.</p><div class="public-actions"><button class="button secondary" id="calendar">${icon('calendar-days')}Add to calendar</button><a class="button secondary" target="_blank" rel="noopener noreferrer" href="${e(mapUrl())}">${icon('map-pin')}Venue</a></div></div>`;
    document.querySelector('#calendar').addEventListener('click', saveCalendar);
    paintIcons();
    return;
  }
  panel.innerHTML = '<div class="loading" role="status">' + icon('loader-circle') + 'Opening your guest pass…</div>';
  paintIcons();
  try {
    if (!state.guest || state.guest.token !== token) state.guest = (await call('guest', { token })).guest;
    if (state.view !== 'pass') return;
    const g = state.guest;
    const seated = Number(g.table) >= 1;
    panel.innerHTML = `<article class="guest-pass"><div class="pass-heading"><span class="eyebrow">YOUR GUEST PASS</span><span class="role-label">${e(g.role)}</span></div>
      <h2>${e(g.name)}</h2><p class="congregation">${e(g.congregation)}</p>
      <div class="pass-body"><div class="seat-block"><span class="seat-label">${seated ? 'YOUR TABLE' : 'SEATING'}</span><strong class="${seated ? 'table-number' : 'desk-label'}">${seated ? e(g.table) : 'Registration desk'}</strong><p>${seated ? 'Welcome to KADIWA Formal.' : 'Please see the registration team on arrival.'}</p><span class="attendance-label ${g.checkedInAt ? 'arrived' : ''}">${g.checkedInAt ? icon('check') + 'Checked in · ' + e(formatTime(g.checkedInAt)) : icon('ticket') + 'Ready for registration'}</span></div><div class="qr-block"><img id="guest-qr" alt="Personal QR pass for ${e(g.name)}" width="208" height="208"><span>KADIWA FORMAL 2026</span></div></div>
      <div class="pass-bottom"><button class="button secondary" id="save-pass">${icon('download')}Save pass</button><button class="icon-button" id="calendar" title="Add event to calendar" aria-label="Add event to calendar">${icon('calendar-days')}</button><button class="icon-button" id="refresh-pass" title="Refresh guest pass" aria-label="Refresh guest pass">${icon('refresh-cw')}</button></div></article>`;
    document.querySelector('#guest-qr').src = await QRCode.toDataURL(guestLink(g.token), { width: 416, margin: 4, errorCorrectionLevel: 'M' });
    document.querySelector('#save-pass').addEventListener('click', () => savePass(g));
    document.querySelector('#calendar').addEventListener('click', saveCalendar);
    document.querySelector('#refresh-pass').addEventListener('click', async () => { state.guest = null; await renderPass(); });
    paintIcons();
  } catch (error) {
    if (state.view !== 'pass') return;
    panel.innerHTML = `<div class="empty-pass"><div class="stamp">${icon('ticket')}</div><h2>Guest pass unavailable</h2><p>${e(error.message)}</p><button class="button secondary" id="retry-pass">${icon('refresh-cw')}Try again</button></div>`;
    document.querySelector('#retry-pass').addEventListener('click', renderPass);
    paintIcons();
  }
}
function mapUrl() { return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(config.venueAddress || config.venue + ', Singapore')}`; }
function renderProgram() {
  document.querySelector('#guest-panel').innerHTML = `<div class="information-panel"><p class="eyebrow">THE EVENING</p><h2>Program</h2>
    <ol class="program-list">${(config.program.length ? config.program : [{ time: timeText, title: 'KADIWA Formal', description: config.venue }]).map(item => `<li><time>${e(item.time)}</time><div><h3>${e(item.title)}</h3>${item.description ? '<p>' + e(item.description) + '</p>' : ''}</div></li>`).join('')}</ol>
    ${config.program.length ? '' : '<p class="pending-note">The full program will be posted soon.</p>'}<button class="button secondary" id="calendar">${icon('calendar-days')}Add to calendar</button></div>`;
  document.querySelector('#calendar').addEventListener('click', saveCalendar);
  paintIcons();
}
function renderReminders() {
  document.querySelector('#guest-panel').innerHTML = `<div class="information-panel"><p class="eyebrow">BEFORE YOU ARRIVE</p><h2>Reminders</h2>
    ${config.reminders.length ? '<ul class="reminder-list">' + config.reminders.map(item => `<li><h3>${e(item.title)}</h3><p>${e(item.text)}</p></li>`).join('') + '</ul>' : '<p class="pending-note">Event reminders will be posted soon.</p>'}
    <div class="venue-details">${icon('map-pin')}<div><h3>${e(config.venue)}</h3><p>${e(dateText)} · ${e(timeText)}</p>${config.venueAddress ? '<p>' + e(config.venueAddress) + '</p>' : ''}<a href="${e(mapUrl())}" target="_blank" rel="noopener noreferrer">View on Google Maps</a></div></div></div>`;
  paintIcons();
}
function download(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function saveCalendar() {
  const stamp = date => new Date(date).toISOString().replaceAll(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escapeIcs = value => String(value).replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll(',', '\\,').replaceAll(';', '\\;');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KADIWA//Formal 2026//EN', 'BEGIN:VEVENT', 'UID:kadiwa-formal-2026@edrienneching-ehc.github.io', `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(config.startsAt)}`];
  if (config.endsAt) lines.push(`DTEND:${stamp(config.endsAt)}`);
  lines.push(`SUMMARY:${escapeIcs(config.eventName)}`, `LOCATION:${escapeIcs(config.venue)}`, 'END:VEVENT', 'END:VCALENDAR');
  download(lines.join('\r\n') + '\r\n', 'text/calendar', 'kadiwa-formal-2026.ics');
}
async function savePass(g) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 900; canvas.height = 1150;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 900, 1150);
    ctx.fillStyle = '#171717'; ctx.fillRect(0, 0, 900, 170);
    ctx.textAlign = 'center'; ctx.fillStyle = '#dfc77e'; ctx.font = '54px Georgia'; ctx.fillText('KADIWA FORMAL', 450, 92);
    ctx.font = '24px Arial'; ctx.fillStyle = '#fff'; ctx.fillText(config.district, 450, 136);
    ctx.fillStyle = '#171717';
    let size = 44; while (size > 14) { ctx.font = `${size}px Arial`; if (ctx.measureText(g.name).width < 800) break; size--; }
    ctx.fillText(g.name, 450, 258);
    ctx.font = '26px Arial'; ctx.fillStyle = '#555'; ctx.fillText(g.role, 450, 306);
    ctx.font = '52px Georgia'; ctx.fillStyle = '#8c6c21'; ctx.fillText(tableText(g.table), 450, 384);
    const image = new Image(); image.src = await QRCode.toDataURL(guestLink(g.token), { width: 520, margin: 4, errorCorrectionLevel: 'M' });
    await image.decode(); ctx.drawImage(image, 190, 425, 520, 520);
    ctx.fillStyle = '#171717'; ctx.font = '27px Arial'; ctx.fillText(`${dateText} · ${timeText}`, 450, 1006);
    ctx.font = '27px Georgia'; ctx.fillText(config.venue, 450, 1050);
    if (isDemo()) { ctx.font = '20px Arial'; ctx.fillStyle = '#777'; ctx.fillText('PREVIEW — SAMPLE PASS', 450, 1100); }
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png'); link.download = `kadiwa-pass-${g.name.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 70)}.png`; link.click();
  } catch { announce('The pass could not be saved. Please try again.', true); }
}
function renderLogin() {
  document.querySelector('#main').innerHTML = `<div class="admin-heading"><p class="eyebrow">KADIWA FORMAL 2026</p><h1>Registration</h1><p>${e(dateText)} · ${e(config.venue)}</p></div><div class="login-layout"><form id="login-form" class="login-panel"><div class="stamp">${icon('shield-check')}</div><h2>Volunteer sign-in</h2><label for="volunteer-name">Your name</label><input id="volunteer-name" name="name" autocomplete="name" required maxlength="80" placeholder="Volunteer name"><label for="volunteer-password">Volunteer password</label><input id="volunteer-password" name="password" type="password" autocomplete="current-password" required><p id="login-error" class="form-error" role="alert"></p><button class="button primary" type="submit">${icon('shield-check')}Sign in</button>${isDemo() ? '<p class="demo-note">Sample preview: enter any name and password.</p>' : ''}</form><img class="login-poster" src="./assets/banner.jpg" width="904" height="1280" alt="KADIWA Formal official invitation"></div>`;
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button'); button.disabled = true;
    document.querySelector('#login-error').textContent = '';
    try {
      const result = await call('login', { name: form.elements.namedItem('name').value.trim(), password: form.elements.namedItem('password').value });
      state.session = result.session; state.volunteer = result.name;
      sessionStorage.setItem('kadiwa-session', state.session); sessionStorage.setItem('kadiwa-volunteer', state.volunteer);
      await renderAdmin();
    } catch (error) { document.querySelector('#login-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  paintIcons();
}
async function loadGuests(quiet = false) {
  try {
    const result = await call('list', { session: state.session });
    state.guests = result.guests;
    if (document.querySelector('#roster')) renderRoster();
    return true;
  } catch (error) {
    if (/sign in again/i.test(error.message)) { await localLogout(); }
    if (!quiet) announce(error.message, true);
    return false;
  }
}
async function renderAdmin() {
  if (!state.session) { renderLogin(); return; }
  document.querySelector('#main').innerHTML = `<div class="admin-heading"><div><p class="eyebrow">KADIWA FORMAL 2026</p><h1>Registration</h1></div><div class="volunteer-meta"><span>${e(state.volunteer)}</span><button class="icon-button" id="logout" title="Sign out" aria-label="Sign out">${icon('log-out')}</button></div></div>
    <div id="attendance-stats" class="attendance-stats" aria-live="polite"><span>Loading attendance…</span></div>
    <div class="registration-tools"><button class="button primary" id="scan-toggle">${icon('camera')}Scan pass</button><label class="button secondary upload-button" title="Scan a QR code from an image">${icon('image-up')}QR image<input id="qr-image" type="file" accept="image/*" aria-label="Upload QR image"></label><div class="tool-spacer"></div><button class="icon-button" id="refresh" title="Refresh attendance" aria-label="Refresh attendance">${icon('refresh-cw')}</button><button class="button secondary" id="print-passes">${icon('printer')}Print passes</button><div class="export-menu"><button class="button secondary" id="export-toggle" aria-expanded="false">${icon('download')}Export${icon('chevron-down')}</button><div id="export-options" class="menu-options" hidden><button id="export-attendance">Attendance CSV</button><button id="export-links">Invitation links CSV</button></div></div></div>
    <section id="scanner-panel" class="scanner-panel" hidden><div id="reader"></div><p id="scanner-message" role="status">Starting camera…</p></section><div id="file-reader" hidden></div>
    <section id="scan-result" class="scan-result" hidden aria-live="polite"></section>
    <div class="roster-controls"><label class="search-field">${icon('search')}<input id="guest-search" type="search" placeholder="Search name, congregation or table" aria-label="Search guests"></label><div class="segmented" aria-label="Attendance filter"><button data-filter="all" class="selected" aria-pressed="true">All</button><button data-filter="waiting" aria-pressed="false">Expected</button><button data-filter="arrived" aria-pressed="false">Arrived</button></div></div>
    <p id="roster-count" class="roster-count" aria-live="polite"></p><div class="roster-wrap"><table class="roster"><thead><tr><th>Guest</th><th>Table</th><th>Status</th><th><span class="sr-only">Guest actions</span></th></tr></thead><tbody id="roster"><tr><td colspan="4">Loading guest list…</td></tr></tbody></table></div>`;
  document.querySelector('#logout').addEventListener('click', async () => { try { await call('logout', { session: state.session }); } catch {} await localLogout(); });
  document.querySelector('#refresh').addEventListener('click', async event => { const button = event.currentTarget; button.disabled = true; await loadGuests(); button.disabled = false; });
  document.querySelector('#scan-toggle').addEventListener('click', toggleScanner);
  document.querySelector('#qr-image').addEventListener('change', scanImage);
  document.querySelector('#guest-search').value = state.query;
  document.querySelector('#guest-search').addEventListener('input', event => { state.query = event.target.value; renderRoster(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); });
    renderRoster();
  }));
  document.querySelector('#print-passes').addEventListener('click', openPrintPasses);
  document.querySelector('#export-toggle').addEventListener('click', () => {
    const menu = document.querySelector('#export-options'); menu.hidden = !menu.hidden;
    document.querySelector('#export-toggle').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.querySelector('#export-attendance').addEventListener('click', () => {
    download('\ufeff' + csv([['Full Name', 'Local Congregation', 'Role', 'Table No', 'Checked In At', 'Checked In By'], ...state.guests.map(g => [g.name, g.congregation, g.role, g.table || '', g.checkedInAt || '', g.checkedInBy || ''])]), 'text/csv;charset=utf-8', 'kadiwa-attendance.csv');
    document.querySelector('#export-options').hidden = true;
  });
  document.querySelector('#export-links').addEventListener('click', () => {
    download('\ufeff' + csv([['Full Name', 'Local Congregation', 'Role', 'Table', 'Personal Invitation Link'], ...state.guests.map(g => [g.name, g.congregation, g.role, tableText(g.table), guestLink(g.token)])]), 'text/csv;charset=utf-8', 'kadiwa-invitation-links.csv');
    document.querySelector('#export-options').hidden = true;
  });
  paintIcons();
  if (!(await loadGuests())) return;
  clearInterval(polling);
  polling = setInterval(() => { if (!document.hidden && !state.busy) loadGuests(true); }, 30000);
}
function renderRoster() {
  const guests = filteredGuests(state.guests, state.query, state.filter);
  const arrived = state.guests.filter(g => g.checkedInAt).length;
  document.querySelector('#attendance-stats').innerHTML = `<div><strong>${arrived}</strong><span>Arrived</span></div><div><strong>${state.guests.length - arrived}</strong><span>Expected</span></div><div><strong>${state.guests.length}</strong><span>Registered</span></div>`;
  document.querySelector('#roster-count').textContent = `${guests.length} ${guests.length === 1 ? 'guest' : 'guests'}`;
  document.querySelector('#roster').innerHTML = guests.length ? guests.map(g => `<tr><td><strong>${e(g.name)}</strong><span class="guest-meta">${e(g.congregation)} · ${e(g.role)}</span></td><td data-label="${g.table > 0 ? 'Table' : 'Seating'}"><span class="table-cell">${g.table > 0 ? e(g.table) : 'Desk'}</span></td><td><span class="status-badge ${g.checkedInAt ? 'arrived' : ''}">${g.checkedInAt ? icon('check') + 'Arrived' : 'Expected'}</span>${g.checkedInAt ? '<time class="checkin-time">' + e(formatTime(g.checkedInAt)) + '</time>' : ''}</td><td><div class="row-actions"><button class="icon-button" data-pass="${e(g.id)}" title="View guest pass" aria-label="View pass for ${e(g.name)}">${icon('ticket')}</button><button class="button checkin-button" data-checkin="${e(g.id)}" ${g.checkedInAt || state.busy ? 'disabled' : ''} aria-label="${g.checkedInAt ? 'Already checked in' : 'Check in ' + e(g.name)}">${icon('check')}<span>${g.checkedInAt ? 'Checked in' : 'Check in'}</span></button></div></td></tr>`).join('') : '<tr><td colspan="4" class="empty-roster">No matching guests.</td></tr>';
  document.querySelectorAll('[data-checkin]').forEach(button => button.addEventListener('click', () => checkIn(state.guests.find(g => g.id === button.dataset.checkin))));
  document.querySelectorAll('[data-pass]').forEach(button => button.addEventListener('click', () => openGuestModal(state.guests.find(g => g.id === button.dataset.pass))));
  paintIcons();
}
async function checkIn(guest) {
  if (state.busy) return;
  state.busy = true; renderRoster();
  try {
    const result = await call('checkIn', { session: state.session, id: guest.id });
    const index = state.guests.findIndex(g => g.id === result.guest.id);
    if (index >= 0) state.guests[index] = result.guest;
    showScanResult(result.guest, result.alreadyCheckedIn);
    announce(result.alreadyCheckedIn ? `${guest.name} is already checked in.` : `${guest.name} checked in.`);
  } catch (error) { announce(error.message, true); }
  finally { state.busy = false; renderRoster(); }
}
function showScanResult(g, alreadyCheckedIn) {
  const panel = document.querySelector('#scan-result');
  panel.hidden = false;
  panel.innerHTML = `<div class="scan-result-icon">${icon('check')}</div><div><p class="eyebrow">${alreadyCheckedIn ? 'ALREADY CHECKED IN' : 'CHECK-IN COMPLETE'}</p><h2>${e(g.name)}</h2><p>${e(tableText(g.table))} · ${e(g.role)}${g.checkedInAt ? ' · ' + e(formatTime(g.checkedInAt)) : ''}</p></div><button class="icon-button dismiss-result" title="Dismiss result" aria-label="Dismiss result">${icon('x')}</button>`;
  panel.querySelector('button').addEventListener('click', () => { panel.hidden = true; });
  paintIcons();
}
async function processCode(value) {
  if (scannerBusy || state.busy) return;
  scannerBusy = true;
  try {
    const token = extractToken(value, isDemo() ? new URL('./', location.href).href : config.siteUrl);
    const guest = state.guests.find(g => g.token === token);
    if (!guest) throw new Error('This guest is not in the current attendee list. Refresh the list or use name lookup.');
    await stopScanner();
    await checkIn(guest);
  } catch (error) { announce(error.message, true); }
  finally { setTimeout(() => { scannerBusy = false; }, 1500); }
}
async function toggleScanner() {
  if (scannerRunning) { await stopScanner(); return; }
  document.querySelector('#scanner-panel').hidden = false;
  document.querySelector('#scanner-message').textContent = 'Starting camera…';
  const button = document.querySelector('#scan-toggle'); button.disabled = true;
  try {
    scanner = new Html5Qrcode('reader');
    await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const size = Math.min(w, h, 280) * .75; return { width: size, height: size }; } }, processCode, () => {});
    scannerRunning = true;
    button.innerHTML = icon('camera-off') + 'Stop camera';
    document.querySelector('#scanner-message').textContent = 'Ready to scan';
    paintIcons();
  } catch {
    document.querySelector('#scanner-message').textContent = 'Camera unavailable. Allow camera access, upload a QR image, or find the guest by name.';
    scanner = null;
  } finally { button.disabled = false; }
}
async function stopScanner() {
  if (scanner && scannerRunning) { try { await scanner.stop(); scanner.clear(); } catch {} }
  scannerRunning = false; scanner = null;
  const panel = document.querySelector('#scanner-panel'); if (panel) panel.hidden = true;
  const button = document.querySelector('#scan-toggle'); if (button) { button.innerHTML = icon('camera') + 'Scan pass'; paintIcons(); }
}
async function scanImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    await stopScanner();
    const reader = new Html5Qrcode('file-reader');
    const value = await reader.scanFile(file, false);
    reader.clear();
    await processCode(value);
  } catch { announce('No readable QR pass was found in this image. Try another image or use name lookup.', true); }
  finally { event.target.value = ''; }
}
function openModal(html, wide = false) {
  lastFocused = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `modal ${wide ? 'wide-modal' : ''}`;
  dialog.innerHTML = `<div class="modal-toolbar"><span>KADIWA Formal · Guest passes</span><button class="icon-button close-modal" title="Close" aria-label="Close">${icon('x')}</button></div>${html}`;
  document.body.append(dialog);
  const close = () => { dialog.close(); dialog.remove(); lastFocused?.focus(); };
  dialog.querySelector('.close-modal').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.showModal(); paintIcons();
  return dialog;
}
async function openGuestModal(g) {
  const dialog = openModal(`<div class="single-pass"><p class="eyebrow">${e(g.role)}</p><h2>${e(g.name)}</h2><p>${e(tableText(g.table))} · ${e(g.congregation)}</p><img alt="QR pass for ${e(g.name)}" width="256" height="256"><div class="public-actions"><button class="button secondary" id="download-single">${icon('download')}Save pass</button><button class="button secondary" id="copy-link">${icon('link')}Copy link</button></div></div>`);
  dialog.querySelector('img').src = await QRCode.toDataURL(guestLink(g.token), { width: 512, margin: 4 });
  dialog.querySelector('#download-single').addEventListener('click', () => savePass(g));
  dialog.querySelector('#copy-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(guestLink(g.token)); announce('Personal invitation link copied.'); } catch { announce('The link could not be copied. Use the invitation links export.', true); } });
}
async function openPrintPasses() {
  if (!state.guests.length) { announce('No guest passes are available yet.', true); return; }
  const dialog = openModal(`<div class="print-toolbar"><h2>Guest passes</h2><button class="button primary" id="print-now" disabled>${icon('printer')}Print / Save PDF</button></div><div class="print-progress" role="status">Preparing ${state.guests.length} passes…</div><div id="print-grid" class="print-grid"></div>`, true);
  const grid = dialog.querySelector('#print-grid');
  for (const g of state.guests) {
    if (!dialog.isConnected) return;
    const image = await QRCode.toDataURL(guestLink(g.token), { width: 320, margin: 4, errorCorrectionLevel: 'M' });
    const article = document.createElement('article'); article.className = 'print-pass';
    article.innerHTML = `<span class="print-brand">KADIWA FORMAL 2026</span>${isDemo() ? '<span class="demo-note">SAMPLE PASS</span>' : ''}<h3>${e(g.name)}</h3><p>${e(g.congregation)} · ${e(g.role)}</p><strong>${e(tableText(g.table))}</strong><img src="${image}" width="160" height="160" alt="QR pass for ${e(g.name)}"><p>October 4 · 5:00 PM<br>${e(config.venue)}</p>`;
    grid.append(article);
  }
  await Promise.all(Array.from(grid.querySelectorAll('img'), img => img.decode()));
  dialog.querySelector('.print-progress').textContent = `${state.guests.length} passes ready`;
  dialog.querySelector('#print-now').disabled = false;
  dialog.querySelector('#print-now').addEventListener('click', () => window.print());
}
async function localLogout() {
  clearInterval(polling);
  await stopScanner();
  state.session = ''; state.volunteer = ''; state.guests = [];
  sessionStorage.removeItem('kadiwa-session'); sessionStorage.removeItem('kadiwa-volunteer');
  document.querySelectorAll('dialog').forEach(dialog => dialog.remove());
  renderLogin();
}
window.addEventListener('pagehide', () => { if (scannerRunning && scanner) scanner.stop().catch(() => {}); });
document.addEventListener('click', event => {
  if (!event.target.closest('.export-menu')) { const menu = document.querySelector('#export-options'); if (menu) { menu.hidden = true; document.querySelector('#export-toggle').setAttribute('aria-expanded', 'false'); } }
});
drawShell();
if (state.view === 'admin') renderAdmin();
else { renderGuest(); renderPass(); }
