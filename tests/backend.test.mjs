import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

function backend() {
  const sheets = new Map();
  const properties = new Map();
  const cache = new Map();
  const sheet = (name, rows = []) => {
    const s = {
      name, rows, maxRows: 1000,
      getLastRow: () => s.rows.length,
      getMaxRows: () => s.maxRows,
      insertRowsAfter: (_, count) => { s.maxRows += count; },
      setFrozenRows() {}, setColumnWidth() {},
      getDataRange: () => ({ getDisplayValues: () => s.rows.map(row => row.map(v => String(v ?? ''))) }),
      getRange: (startRow, startCol, count, width) => {
        const range = {
          getValues: () => Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => s.rows[startRow - 1 + i]?.[startCol - 1 + j] ?? '')),
          setValues: values => { values.forEach((row, i) => { const dest = s.rows[startRow - 1 + i] ||= []; row.forEach((v, j) => { dest[startCol - 1 + j] = v; }); }); return range; },
          setFontWeight: () => range, setBackground: () => range, setFontColor: () => range, setNumberFormat: () => range
        }; return range;
      }
    }; return s;
  };
  const source = sheet('Seating Arrangement', [['Full Name', 'Local Congregation', 'Table No', 'Role'], ['Alex Santos', 'East', 4, 'Attendee'], ['Sam Rivera', 'North', 0, 'Performer']]);
  sheets.set(source.name, source);
  const book = { getSheetByName: name => sheets.get(name), insertSheet: name => { const s = sheet(name); sheets.set(name, s); return s; } };
  const context = vm.createContext({
    SpreadsheetApp: { openById: () => book, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || null, setProperties: obj => { for (const [k,v] of Object.entries(obj)) properties.set(k,v); } }) },
    CacheService: { getScriptCache: () => ({ get: key => cache.get(key) || null, put: (key, value) => cache.set(key, value), remove: key => cache.delete(key) }) },
    Utilities: { getUuid: randomUUID }
  });
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), context);
  const run = expression => vm.runInContext(expression, context);
  properties.set('SETUP_DONE', 'true');
  run('syncGuestPasses_()');
  return { run, source, sheets, properties, cache, context };
}

test('only a personal token can look up or check in one guest; roster operations are unavailable', () => {
  const b = backend();
  for (const method of ['list', 'login', 'logout', 'showGuestPasses_', 'unknown']) {
    assert.throws(() => b.run(`eventRpc('${method}', {})`), /Unknown request/);
  }
  for (const args of ['{}', '{id:"demo-1"}', '{token:"bad"}', '{token:123}']) {
    assert.throws(() => b.run(`eventRpc('checkIn', ${args})`), /pass not found/);
  }
  assert.throws(() => b.run(`eventRpc('checkIn', {token:'${'f'.repeat(64)}'})`), /pass not found/);
  assert.equal(b.sheets.get('Event Passes').rows[1][6], '');
});
test('QR tokens and invitation links survive seating changes without exposing other guests', () => {
  const b = backend();
  const row = b.sheets.get('Event Passes').rows[1];
  const token = row[5];
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(row[10], 'https://edrienneching-ehc.github.io/kadiwaformal2026/?pass=' + token);
  b.source.rows[1][2] = 15;
  const guest = b.run(`eventRpc('guest', {token: '${token}'}).guest`);
  assert.equal(guest.table, 15);
  assert.equal(guest.id, undefined);
  assert.equal(guest.checkedInBy, undefined);
  b.run('syncGuestPasses_()');
  assert.equal(row[5], token);
  assert.equal(b.sheets.get('Event Passes').rows.length, 3);
});
test('self-check-in only writes arrival cells and duplicate taps preserve the original time', () => {
  const b = backend();
  const rows = b.sheets.get('Event Passes').rows;
  const token = rows[1][5];
  const before = JSON.stringify(rows[2]);
  const first = b.run(`eventRpc('checkIn', {token: '${token}'})`);
  assert.equal(first.alreadyCheckedIn, false);
  assert.ok(first.guest.checkedInAt);
  assert.equal(rows[1][7], 'Self check-in');
  const second = b.run(`eventRpc('checkIn', {token: '${token}'})`);
  assert.equal(second.alreadyCheckedIn, true);
  assert.equal(second.guest.checkedInAt, first.guest.checkedInAt);
  assert.equal(JSON.stringify(rows[2]), before);
});
test('removed guests cannot check in; new guests receive different tokens', () => {
  const b = backend();
  const token = b.sheets.get('Event Passes').rows[1][5];
  b.source.rows.splice(1, 1);
  for (const method of ['guest', 'checkIn']) {
    assert.throws(() => b.run(`eventRpc('${method}', {token: '${token}'})`), /no longer/);
  }
  b.source.rows.push(['Casey Garcia', 'West', 5, 'Attendee']);
  b.run('syncGuestPasses_()');
  assert.equal(b.sheets.get('Event Passes').rows[1][8], false);
  assert.notEqual(b.sheets.get('Event Passes').rows.at(-1)[5], token);
});
test('existing ten-column registry upgrades without changing tokens or attendance', () => {
  const b = backend();
  const registry = b.sheets.get('Event Passes');
  const token = registry.rows[1][5];
  registry.rows.forEach(row => row.splice(10));
  registry.rows[1][6] = '2026-10-04T09:00:00.000Z';
  registry.rows[1][7] = 'Original organizer';
  b.run('syncGuestPasses_()');
  assert.equal(registry.rows[0][10], 'Personal Invitation Link');
  assert.equal(registry.rows[1][5], token);
  assert.equal(registry.rows[1][6], '2026-10-04T09:00:00.000Z');
  b.run(`eventRpc('checkIn', {token:'${token}'})`);
  assert.equal(registry.rows[1][7], 'Original organizer');
});
test('setup is required, and invalid roster assignments are detected', () => {
  const b = backend();
  const token = b.sheets.get('Event Passes').rows[1][5];
  b.properties.delete('SETUP_DONE');
  assert.throws(() => b.run(`eventRpc('guest', {token:'${token}'})`), /being prepared/);
  b.source.rows.push(['Alex Santos', 'East', 8, 'Attendee']);
  assert.throws(() => b.run('syncGuestPasses_()'), /Duplicate attendee/);
  b.source.rows.pop(); b.source.rows[1][2] = 16;
  assert.throws(() => b.run('syncGuestPasses_()'), /Invalid table/);
});
test('private pass modal escapes embedded JSON and has no public roster entry point', () => {
  const b = backend();
  let html;
  b.context.HtmlService = { createHtmlOutput: value => { html = value; return { setWidth() { return this; }, setHeight() { return this; } }; } };
  b.context.SpreadsheetApp.getUi = () => ({ showModalDialog() {} });
  b.source.rows[1][0] = '</script><img src=x onerror=alert(1)>';
  b.run('showGuestPasses_()');
  assert.ok(!html.includes('</script><img'));
  assert.ok(html.includes('\\u003c/script>'));
  assert.ok(html.includes('assets/pass-tools.js'));
});
