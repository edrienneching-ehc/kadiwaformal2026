import { createIcons, CalendarDays, MapPin, Ticket, Clock, Info, Check, RefreshCw, Download, ChevronDown, LoaderCircle } from 'lucide';
import QRCode from 'qrcode';
import config from '../site-config.json';
import { call, isDemo } from './api.js';
import { passUrl } from './domain.js';
import { saveGuestPass } from './pass-image.js';

const icons = { CalendarDays, MapPin, Ticket, Clock, Info, Check, RefreshCw, Download, ChevronDown, LoaderCircle };
const params = new URLSearchParams(location.search);
const app = document.querySelector('#app');
const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const dateText = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(config.startsAt));
const timeText = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(config.startsAt));
const formatTime = date => new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(date));
const state = { view: 'pass', guest: null, busy: false, lookup: null };
let toastTimer;

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
      <span class="header-district">${e(config.district)}</span></header>
    <main id="main" class="guest-main"></main>
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
  if (isDemo() && !token && params.get('find') !== '1') token = '1'.repeat(64);
  if (!token && params.get('find') === '1') { renderFinder(); return; }
  if (!token) {
    panel.innerHTML = `<div class="empty-pass"><div class="stamp">${icon('ticket')}</div><p class="eyebrow">YOUR INVITATION</p><h2>A seat at the celebration</h2><p>Your personal guest pass will appear here when you open your invitation link.</p><div class="public-actions"><a class="button primary" href="${e(finderUrl())}">${icon('ticket')}Find my pass</a><button class="button secondary" id="calendar">${icon('calendar-days')}Add to calendar</button><a class="button secondary" target="_blank" rel="noopener noreferrer" href="${e(mapUrl())}">${icon('map-pin')}Venue</a></div></div>`;
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
      <div class="pass-body"><div class="seat-block"><span class="seat-label">${seated ? 'YOUR TABLE' : 'SEATING'}</span><strong class="${seated ? 'table-number' : 'desk-label'}">${seated ? e(g.table) : 'Registration desk'}</strong><p>${seated ? 'Welcome to KADIWA Formal.' : 'Please see the registration team on arrival.'}</p><span class="attendance-label ${g.checkedInAt ? 'arrived' : ''}">${g.checkedInAt ? icon('check') + 'Checked in · ' + e(formatTime(g.checkedInAt)) : icon('ticket') + 'Not checked in yet'}</span></div><div class="qr-block"><img id="guest-qr" alt="Personal QR pass for ${e(g.name)}" width="208" height="208"><span>KADIWA FORMAL 2026</span></div></div>
      ${g.checkedInAt ? '<p class="arrival-confirmed">You are checked in. Enjoy the evening!</p>' : '<div class="arrival-action"><button class="button primary" id="self-check-in">' + icon('check') + 'I&#39;m here</button><p>Check in when you arrive at the venue.</p><p id="check-in-error" class="form-error" role="alert"></p></div>'}
      <div class="pass-bottom"><button class="button secondary" id="save-pass">${icon('download')}Save pass</button><button class="icon-button" id="calendar" title="Add event to calendar" aria-label="Add event to calendar">${icon('calendar-days')}</button><button class="icon-button" id="refresh-pass" title="Refresh guest pass" aria-label="Refresh guest pass">${icon('refresh-cw')}</button></div></article>`;
    document.querySelector('#guest-qr').src = await QRCode.toDataURL(guestLink(g.token), { width: 416, margin: 4, errorCorrectionLevel: 'M' });
    document.querySelector('#self-check-in')?.addEventListener('click', selfCheckIn);
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

function finderUrl() {
  const url = new URL(demoLink());
  url.searchParams.set('find', '1');
  return url.href;
}
function renderFinder() {
  const panel = document.querySelector('#guest-panel');
  const lookup = state.lookup;
  if (lookup) {
    panel.innerHTML = '<div class="information-panel"><p class="eyebrow">YOUR INVITATION</p><h2>Select your name</h2>' +
      '<p class="lookup-local">' + e(lookup.congregation) + '</p><form class="lookup-form" id="select-pass">' +
      '<label for="guest-name">Full name</label><select id="guest-name" required>' +
      (lookup.guests.length > 1 ? '<option value="">Select your name</option>' : '') +
      lookup.guests.map(g => '<option value="' + e(g.id) + '">' + e(g.name) + '</option>').join('') +
      '</select><p class="lookup-error" id="lookup-error" role="alert"></p><div class="public-actions">' +
      '<button class="button primary" type="submit">' + icon('ticket') + 'Open my pass</button>' +
      '<button class="button secondary" id="lookup-back" type="button">Back</button></div></form></div>';
    document.querySelector('#lookup-back').addEventListener('click', () => { state.lookup = null; renderFinder(); });
    document.querySelector('#select-pass').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const result = await call('openPass', { lookupSession: lookup.lookupSession, id: form.querySelector('select').value });
        state.guest = result.guest;
        params.delete('find');
        params.set('pass', result.guest.token);
        history.replaceState(null, '', guestLink(result.guest.token));
        state.lookup = null;
        state.view = 'pass';
        renderGuest();
        await renderPass();
      } catch (error) {
        if (form.isConnected) form.querySelector('#lookup-error').textContent = friendlyLookupError(error);
      } finally { button.disabled = false; }
    });
  } else {
    panel.innerHTML = '<div class="information-panel"><p class="eyebrow">YOUR INVITATION</p><h2>Find your guest pass</h2>' +
      '<form class="lookup-form" id="find-pass"><label for="lookup-local">Local Congregation</label>' +
      '<input id="lookup-local" name="congregation" list="local-options" autocomplete="organization" required maxlength="100">' +
      '<datalist id="local-options">' + (config.congregations || []).map(local => '<option value="' + e(local) + '"></option>').join('') +
      '</datalist><label for="lookup-contact">Registered contact number</label>' +
      '<input id="lookup-contact" name="contact" type="tel" autocomplete="tel" required minlength="8" maxlength="30">' +
      '<p class="lookup-error" id="lookup-error" role="alert"></p><button class="button primary" type="submit">' +
      icon('ticket') + 'Find my pass</button></form><p class="lookup-help">No matching pass? Please approach registration or use your personal invitation link.</p></div>';
    document.querySelector('#find-pass').addEventListener('input', event => { event.currentTarget.querySelector('#lookup-error').textContent = ''; });
    document.querySelector('#find-pass').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button');
      button.disabled = true;
      button.innerHTML = icon('loader-circle') + 'Finding your pass...';
      form.querySelector('#lookup-error').textContent = '';
      paintIcons();
      try {
        const congregation = form.elements.namedItem('congregation').value.trim();
        const result = await call('findPasses', { congregation, contact: form.elements.namedItem('contact').value });
        if (form.isConnected) { state.lookup = { ...result, congregation }; renderFinder(); }
      } catch (error) {
        if (form.isConnected) form.querySelector('#lookup-error').textContent = friendlyLookupError(error);
      } finally {
        if (form.isConnected) {
          button.disabled = false;
          button.innerHTML = icon('ticket') + 'Find my pass';
          paintIcons();
        }
      }
    });
  }
  paintIcons();
}
function friendlyLookupError(error) {
  return /Unknown request|timed out/i.test(error.message)
    ? 'Pass lookup is being prepared. Please use your personal invitation link or approach registration.'
    : error.message;
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
    <div class="venue-details">${icon('map-pin')}<div><h3>Getting there</h3><p>${e(config.venue)}</p>${config.venueAddress ? '<p>' + e(config.venueAddress) + '</p>' : ''}<a href="${e(mapUrl())}" target="_blank" rel="noopener noreferrer">View on Google Maps</a>
      ${config.directions?.length ? '<div class="walking-routes">' + config.directions.map(route => `<details class="walking-route"><summary><span><strong>${e(route.title)}</strong><span class="walking-time">${e(route.walkingTime)}</span></span>${icon('chevron-down')}</summary><ol class="directions-list">${route.steps.map(step => '<li>' + e(step) + '</li>').join('')}</ol><a class="button secondary guide-link" href="${e(route.pdf)}" target="_blank" rel="noopener noreferrer">${icon('download')}Walking guide (PDF)<span class="sr-only"> — ${e(route.title)}</span></a></details>`).join('') + '</div>' : ''}</div></div></div>`;
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
  try { await saveGuestPass(g, guestLink(g.token), isDemo()); }
  catch { announce('The pass could not be saved. Please try again.', true); }
}
async function selfCheckIn() {
  if (state.busy || !state.guest || state.guest.checkedInAt) return;
  state.busy = true;
  const button = document.querySelector('#self-check-in');
  const errorLabel = document.querySelector('#check-in-error');
  button.disabled = true;
  button.innerHTML = icon('loader-circle') + 'Checking in...';
  errorLabel.textContent = '';
  paintIcons();
  try {
    const result = await call('checkIn', { token: state.guest.token });
    state.guest = result.guest;
    if (state.view === 'pass') await renderPass();
    announce(result.alreadyCheckedIn ? 'You are already checked in.' : "You're checked in. Welcome!");
  } catch (error) {
    if (errorLabel.isConnected) errorLabel.textContent = error.message;
    announce(error.message, true);
  } finally {
    state.busy = false;
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = icon('check') + "I'm here";
      paintIcons();
    }
  }
}
drawShell();
renderGuest();
renderPass();
