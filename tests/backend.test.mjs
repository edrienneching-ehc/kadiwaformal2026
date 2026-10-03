import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
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
    Utilities: { getUuid: randomUUID, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, computeDigest: (_, value) => Array.from(createHash('sha256').update(value).digest()) }
  });
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), context);
  const run = expression => vm.runInContext(expression, context);
  const salt = 'test-salt';
  properties.set('STAFF_SALT', salt);
  properties.set('STAFF_HASH', createHash('sha256').update(salt + 'strong-test-password').digest('hex'));
  run('syncGuestPasses_()');
  return { run, source, sheets, properties, cache, context };
}

test('real attendance operations require a valid volunteer session', () => {
  const b = backend();
  for (const method of ['list', 'checkIn', 'logout']) assert.throws(() => b.run(`eventRpc('${method}', {})`), /sign in again/);
  assert.throws(() => b.run("eventRpc('login', { name: 'Volunteer', password: 'wrong' })"), /incorrect/);
});
test('QR tokens survive seating changes and repeated sync; guest lookup does not expose the roster', () => {
  const b = backend();
  const token = b.sheets.get('Event Passes').rows[1][5];
  assert.match(token, /^[a-f0-9]{64}$/);
  b.source.rows[1][2] = 15;
  const guest = b.run(`eventRpc('guest', {token: '${token}'}).guest`);
  assert.equal(guest.table, 15);
  assert.equal(guest.id, undefined);
  assert.equal(guest.checkedInBy, undefined);
  b.run('syncGuestPasses_()');
  assert.equal(b.sheets.get('Event Passes').rows[1][5], token);
  assert.equal(b.sheets.get('Event Passes').rows.length, 3);
});
test('duplicate check-in preserves the original time and volunteer', () => {
  const b = backend();
  const session = b.run("eventRpc('login', { name: 'First Volunteer', password: 'strong-test-password' }).session");
  const id = b.sheets.get('Event Passes').rows[1][0];
  const first = b.run(`eventRpc('checkIn', {session: '${session}', id: '${id}'})`);
  assert.equal(first.alreadyCheckedIn, false);
  assert.ok(first.guest.checkedInAt);
  const second = b.run(`eventRpc('checkIn', {session: '${session}', id: '${id}'})`);
  assert.equal(second.alreadyCheckedIn, true);
  assert.equal(second.guest.checkedInAt, first.guest.checkedInAt);
  assert.equal(second.guest.checkedInBy, 'First Volunteer');
});
test('removed guests lose access; new guests receive different tokens', () => {
  const b = backend();
  const token = b.sheets.get('Event Passes').rows[1][5];
  b.source.rows.splice(1, 1);
  assert.throws(() => b.run(`eventRpc('guest', {token: '${token}'})`), /no longer/);
  b.source.rows.push(['Casey Garcia', 'West', 5, 'Attendee']);
  b.run('syncGuestPasses_()');
  assert.equal(b.sheets.get('Event Passes').rows[1][8], false);
  assert.notEqual(b.sheets.get('Event Passes').rows.at(-1)[5], token);
});
test('logout and password rotation invalidate sessions', () => {
  const b = backend();
  const session = b.run("eventRpc('login', { name: 'Volunteer', password: 'strong-test-password' }).session");
  b.run(`eventRpc('logout', {session:'${session}'})`);
  assert.throws(() => b.run(`eventRpc('list', {session:'${session}'})`), /sign in again/);
  const next = b.run("eventRpc('login', { name: 'Volunteer', password: 'strong-test-password' }).session");
  b.properties.set('STAFF_HASH', 'rotated');
  assert.throws(() => b.run(`eventRpc('list', {session:'${next}'})`), /sign in again/);
});
test('duplicate identities and invalid table assignments are detected', () => {
  const b = backend();
  b.source.rows.push(['Alex Santos', 'East', 8, 'Attendee']);
  assert.throws(() => b.run('syncGuestPasses_()'), /Duplicate attendee/);
  b.source.rows.pop(); b.source.rows[1][2] = 16;
  assert.throws(() => b.run('syncGuestPasses_()'), /Invalid table/);
});
