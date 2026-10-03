const KADIWA = {
  spreadsheetId: '1gut8zMibyILfxVe1-5XaD4x7M1MiI0AXdwevqfvpKSo',
  sourceSheet: 'Seating Arrangement',
  registrySheet: 'Event Passes',
  siteUrl: 'https://edrienneching-ehc.github.io/kadiwaformal2026/',
  headers: ['Guest ID', 'Full Name', 'Local Congregation', 'Role', 'Table No', 'Pass Token', 'Checked In At', 'Checked In By', 'Active', 'Source Key', 'Personal Invitation Link']
};

function onOpen() {
  SpreadsheetApp.getUi().createMenu('KADIWA Formal')
    .addItem('Set up guest passes', 'setupKadiwa_')
    .addItem('Refresh guest passes from seating list', 'syncGuestPasses_')
    .addItem('Print / download guest passes', 'showGuestPasses_')
    .addToUi();
}

// Editor-only functions end in an underscore and cannot be called by visitors.
function setupKadiwa_() {
  const ui = SpreadsheetApp.getUi();
  PropertiesService.getScriptProperties().setProperties({ SETUP_DONE: 'true', SITE_URL: KADIWA.siteUrl });
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
  if (properties.getProperty('SETUP_DONE') !== 'true') return HtmlService.createHtmlOutput('Registration is being prepared.');
  const siteUrl = properties.getProperty('SITE_URL') || KADIWA.siteUrl;
  const origin = siteUrl.match(/^https:\/\/[^/]+/);
  if (!origin) throw new Error('SITE_URL must be an HTTPS website URL.');
  const template = HtmlService.createTemplateFromFile('Bridge');
  template.bridge = bridge;
  template.allowedOrigin = origin[0];
  return template.evaluate().setTitle('KADIWA Formal connection').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// A personal token allows lookup and arrival recording for that guest only.
function eventRpc(method, args) {
  args = args || {};
  if (method !== 'guest' && method !== 'checkIn') throw new Error('Unknown request.');
  if (PropertiesService.getScriptProperties().getProperty('SETUP_DONE') !== 'true') throw new Error('Guest passes are being prepared.');
  if (typeof args !== 'object' || typeof args.token !== 'string' || !/^[a-f0-9]{64}$/.test(args.token)) throw new Error('Guest pass not found. Please approach the registration desk.');
  if (method === 'guest') return { guest: getGuest_(args.token) };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // Validate against the live roster before changing any attendance cells.
    getGuest_(args.token);
    const sheet = registry_();
    const rows = registryRows_();
    const index = rows.findIndex(row => String(row[5]) === args.token);
    const row = rows[index];
    const alreadyCheckedIn = Boolean(row[6]);
    if (!alreadyCheckedIn) {
      row[6] = new Date().toISOString();
      row[7] = 'Self check-in';
      sheet.getRange(index + 2, 7, 1, 2).setValues([[row[6], row[7]]]);
      SpreadsheetApp.flush();
    }
    return { guest: getGuest_(args.token), alreadyCheckedIn: alreadyCheckedIn };
  } finally { lock.releaseLock(); }
}

function showGuestPasses_() {
  syncGuestPasses_();
  const rows = registryRows_().filter(row => row[8] === true);
  const data = JSON.stringify({ siteUrl: KADIWA.siteUrl, guests: rows.map(guestObject_) }).replace(/</g, '\\u003c');
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">' +
    '<link rel="stylesheet" href="' + KADIWA.siteUrl + 'assets/style.css"></head><body class="pass-tools">' +
    '<main id="pass-tools"><p role="status">Preparing guest passes...</p></main>' +
    '<script id="pass-data" type="application/json">' + data + '</script>' +
    '<script type="module" src="' + KADIWA.siteUrl + 'assets/pass-tools.js"></script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(1050).setHeight(650), 'KADIWA guest passes');
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
    if (headers.slice(0, 10).join('|') === KADIWA.headers.slice(0, 10).join('|') && !headers[10]) {
      sheet.getRange(1, 11, 1, 1).setValues([[KADIWA.headers[10]]]).setFontWeight('bold');
      sheet.setColumnWidth(11, 420);
      headers[10] = KADIWA.headers[10];
    }
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
    row[10] = KADIWA.siteUrl + '?pass=' + row[5];
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

function getGuest_(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) throw new Error('Guest pass not found. Please approach the registration desk.');
  const row = registryRows_().find(row => String(row[5]) === token);
  if (!row) throw new Error('Guest pass not found. Please approach the registration desk.');
  const guest = readRoster_().find(guest => guest.key === row[9]);
  if (!guest) throw new Error('This pass is no longer in the attendee list. Please approach the registration desk.');
  const current = row.slice();
  current[1] = guest.name; current[2] = guest.congregation; current[3] = guest.role; current[4] = guest.table;
  return guestObject_(current);
}

function guestObject_(row) {
  const result = { name: String(row[1]), congregation: String(row[2]), role: String(row[3]), table: Number(row[4]) || 0, token: String(row[5]), checkedInAt: row[6] ? new Date(row[6]).toISOString() : null };
  return result;
}

function randomToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
