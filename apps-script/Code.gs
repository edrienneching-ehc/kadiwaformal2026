const KADIWA = {
  spreadsheetId: '1gut8zMibyILfxVe1-5XaD4x7M1MiI0AXdwevqfvpKSo',
  sourceSheet: 'Seating Arrangement',
  registrySheet: 'Event Passes',
  siteUrl: 'https://edrienneching-ehc.github.io/kadiwaformal2026/',
  headers: ['Guest ID', 'Full Name', 'Local Congregation', 'Role', 'Table No', 'Pass Token', 'Checked In At', 'Checked In By', 'Active', 'Source Key']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('KADIWA Formal')
    .addItem('Set up / reset volunteer password', 'setupKadiwa_')
    .addItem('Refresh guest passes from seating list', 'syncGuestPasses_')
    .addToUi();
}

// Editor-only functions end in an underscore and cannot be called by visitors.
function setupKadiwa_() {
  const ui = SpreadsheetApp.getUi();
  const prompt = ui.prompt('KADIWA Formal setup', 'Choose a volunteer password of at least 12 characters. Share it only with your registration team.', ui.ButtonSet.OK_CANCEL);
  if (prompt.getSelectedButton() !== ui.Button.OK) return;
  const password = prompt.getResponseText();
  if (password.length < 12 || password.length > 200) throw new Error('Choose a password between 12 and 200 characters.');
  const properties = PropertiesService.getScriptProperties();
  const salt = randomToken_();
  properties.setProperties({ STAFF_SALT: salt, STAFF_HASH: hash_(salt + password), SITE_URL: KADIWA.siteUrl });
  CacheService.getScriptCache().remove('login-failures');
  const count = syncGuestPasses_();
  ui.alert('Ready', count + ' guest passes are ready in the Event Passes tab. Your existing attendance records and QR tokens have been preserved. Next, deploy this script as a web app.', ui.ButtonSet.OK);
}

function syncGuestPasses_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return syncRegistry_().filter(row => row[8] === true).length; }
  finally { lock.releaseLock(); }
}

function doGet(event) {
  const bridge = String(event && event.parameter && event.parameter.bridge || '');
  if (!/^[a-f0-9-]{36}$/.test(bridge)) return HtmlService.createHtmlOutput('KADIWA Formal. Open your personal invitation link or the event website.');
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('STAFF_HASH')) return HtmlService.createHtmlOutput('Registration is being prepared.');
  const siteUrl = properties.getProperty('SITE_URL') || KADIWA.siteUrl;
  const origin = siteUrl.match(/^https:\/\/[^/]+/);
  if (!origin) throw new Error('SITE_URL must be an HTTPS website URL.');
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.bridge = bridge;
  template.allowedOrigin = origin[0];
  return template.evaluate().setTitle('KADIWA Formal connection').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// The public entry point validates every operation; only guest lookup is public.
function eventRpc(method, args) {
  args = args || {};
  if (typeof method !== 'string' || !args || typeof args !== 'object') throw new Error('Invalid request.');
  if (method === 'login') return login_(args);
  if (method === 'guest') return { guest: getGuest_(args.token, false) };
  const volunteer = requireSession_(args.session);
  if (method === 'logout') { CacheService.getScriptCache().remove(sessionKey_(args.session)); return true; }
  if (method === 'list') {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try { return { guests: syncRegistry_().filter(row => row[8] === true).map(row => guestObject_(row, true)) }; }
    finally { lock.releaseLock(); }
  }
  if (method === 'checkIn') {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const rows = syncRegistry_();
      const index = rows.findIndex(row => row[8] === true && String(row[0]) === String(args.id));
      if (index < 0) throw new Error('Guest not found in the current seating list.');
      const row = rows[index];
      const alreadyCheckedIn = Boolean(row[6]);
      if (!alreadyCheckedIn) {
        row[6] = new Date().toISOString();
        row[7] = volunteer.name;
        registry_().getRange(index + 2, 7, 1, 2).setValues([[row[6], row[7]]]);
        SpreadsheetApp.flush();
      }
      return { guest: guestObject_(row, true), alreadyCheckedIn: alreadyCheckedIn };
    } finally { lock.releaseLock(); }
  }
  throw new Error('Unknown request.');
}

function login_(args) {
  const name = String(args.name || '').trim();
  const password = String(args.password || '');
  if (!name || name.length > 80 || password.length > 200) throw new Error('Enter your name and volunteer password.');
  const properties = PropertiesService.getScriptProperties();
  const storedHash = properties.getProperty('STAFF_HASH');
  if (!storedHash) throw new Error('Volunteer registration has not been configured yet.');
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const failures = Number(cache.get('login-failures') || 0);
    if (failures >= 30) throw new Error('Too many sign-in attempts. Please try again in 10 minutes.');
    if (hash_(properties.getProperty('STAFF_SALT') + password) !== storedHash) {
      cache.put('login-failures', String(failures + 1), 600);
      throw new Error('The volunteer password is incorrect.');
    }
    cache.remove('login-failures');
    const session = randomToken_();
    cache.put(sessionKey_(session), JSON.stringify({ name: name, passwordVersion: storedHash }), 21600);
    return { session: session, name: name };
  } finally { lock.releaseLock(); }
}

function requireSession_(session) {
  if (!/^[a-f0-9]{64}$/.test(String(session || ''))) throw new Error('Please sign in again.');
  const value = CacheService.getScriptCache().get(sessionKey_(session));
  if (!value) throw new Error('Your volunteer session has expired. Please sign in again.');
  const volunteer = JSON.parse(value);
  if (volunteer.passwordVersion !== PropertiesService.getScriptProperties().getProperty('STAFF_HASH')) throw new Error('Please sign in again.');
  return volunteer;
}

function sourceKey_(name, congregation) {
  return JSON.stringify([String(name).trim().toLowerCase().replace(/\s+/g, ' '), String(congregation).trim().toLowerCase().replace(/\s+/g, ' ')]);
}

function readRoster_() {
  const sheet = SpreadsheetApp.openById(KADIWA.spreadsheetId).getSheetByName(KADIWA.sourceSheet);
  if (!sheet) throw new Error('The Seating Arrangement tab was not found.');
  const values = sheet.getDataRange().getDisplayValues();
  const headers = values.shift().map(value => value.trim());
  const columns = ['Full Name', 'Local Congregation', 'Table No', 'Role'].map(header => headers.indexOf(header));
  if (columns.some(index => index < 0)) throw new Error('Keep the Full Name, Local Congregation, Table No and Role headers in the seating sheet.');
  const seen = {};
  return values.filter(row => String(row[columns[0]]).trim()).map(row => {
    const name = String(row[columns[0]]).trim();
    const congregation = String(row[columns[1]]).trim();
    const table = Number(String(row[columns[2]]).trim() || 0);
    if (!Number.isInteger(table) || table < 0 || table > 15) throw new Error('Invalid table number for ' + name + '. Use 0 for registration desk or 1–15 for assigned tables.');
    const key = sourceKey_(name, congregation);
    if (seen[key]) throw new Error('Duplicate attendee name and congregation: ' + name + '. Resolve the duplicate before refreshing passes.');
    seen[key] = true;
    return { name: name, congregation: congregation, table: table, role: String(row[columns[3]]).trim() || 'Attendee', key: key };
  });
}

function registry_() {
  const book = SpreadsheetApp.openById(KADIWA.spreadsheetId);
  let sheet = book.getSheetByName(KADIWA.registrySheet);
  if (!sheet) {
    sheet = book.insertSheet(KADIWA.registrySheet);
    sheet.getRange(1, 1, 1, KADIWA.headers.length).setValues([KADIWA.headers]).setFontWeight('bold').setBackground('#171717').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, sheet.getMaxRows(), KADIWA.headers.length).setNumberFormat('@');
    sheet.setColumnWidth(2, 240);
    sheet.setColumnWidth(6, 280);
    sheet.setColumnWidth(7, 210);
  } else {
    const headers = sheet.getRange(1, 1, 1, KADIWA.headers.length).getValues()[0];
    if (headers.join('|') !== KADIWA.headers.join('|')) throw new Error('Event Passes headers were changed. Restore the original headers before continuing.');
  }
  return sheet;
}

function registryRows_() {
  const sheet = registry_();
  return sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, KADIWA.headers.length).getValues() : [];
}

function syncRegistry_() {
  const roster = readRoster_();
  const sheet = registry_();
  const rows = registryRows_();
  const original = JSON.stringify(rows);
  const byKey = {};
  rows.forEach(row => {
    if (byKey[row[9]]) throw new Error('Duplicate records in Event Passes. Contact the organizer.');
    byKey[row[9]] = row;
    row[8] = false;
  });
  roster.forEach(guest => {
    let row = byKey[guest.key];
    if (!row) {
      row = [Utilities.getUuid(), guest.name, guest.congregation, guest.role, guest.table, randomToken_(), '', '', true, guest.key];
      rows.push(row);
    } else {
      row[1] = guest.name; row[2] = guest.congregation; row[3] = guest.role; row[4] = guest.table; row[8] = true;
    }
  });
  if (rows.length && original !== JSON.stringify(rows)) {
    if (sheet.getMaxRows() < rows.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
    const range = sheet.getRange(2, 1, rows.length, KADIWA.headers.length);
    // Text formatting also keeps attendee names from becoming sheet formulas.
    range.setNumberFormat('@');
    const safeRows = rows.map(row => row.map(value => typeof value === 'string' && /^[=+@\-]/.test(value) ? "'" + value : value));
    range.setValues(safeRows);
    SpreadsheetApp.flush();
  }
  return rows;
}

function getGuest_(token, staff) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) throw new Error('Guest pass not found. Please approach the registration desk.');
  const row = registryRows_().find(row => String(row[5]) === token);
  if (!row) throw new Error('Guest pass not found. Please approach the registration desk.');
  const guest = readRoster_().find(guest => guest.key === row[9]);
  if (!guest) throw new Error('This pass is no longer in the attendee list. Please approach the registration desk.');
  const current = row.slice();
  current[1] = guest.name; current[2] = guest.congregation; current[3] = guest.role; current[4] = guest.table;
  return guestObject_(current, staff);
}

function guestObject_(row, staff) {
  const result = { name: String(row[1]), congregation: String(row[2]), role: String(row[3]), table: Number(row[4]) || 0, token: String(row[5]), checkedInAt: row[6] ? new Date(row[6]).toISOString() : null };
  if (staff) { result.id = String(row[0]); result.checkedInBy = String(row[7] || ''); }
  return result;
}

function randomToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function hash_(value) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(byte => ('0' + (byte & 255).toString(16)).slice(-2)).join(''); }
function sessionKey_(session) { return 'session-' + hash_(String(session)); }
