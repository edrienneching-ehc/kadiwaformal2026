import test from 'node:test';
import assert from 'node:assert/strict';
import { tableText, extractToken, passUrl, csv, filteredGuests } from '../src/domain.js';

const site = 'https://edrienneching-ehc.github.io/kadiwaformal2026/';
const token = 'abcde012'.repeat(8);
test('table zero, blanks and invalid numbers never display a table assignment', () => {
  for (const value of [0, '', null, undefined, -1, 16, 'invalid']) assert.equal(tableText(value), 'Registration desk');
  assert.equal(tableText('15'), 'Table 15');
});
test('QR extraction accepts event links and rejects foreign sites, paths and malformed tokens', () => {
  assert.equal(extractToken(passUrl(token, site), site), token);
  assert.equal(extractToken(token, site), token);
  for (const link of ['https://attacker.example/?pass=' + token, site + 'another/?pass=' + token, site + '?pass=bad', 'just words']) assert.throws(() => extractToken(link, site));
});
test('CSV exports quote commas and neutralize spreadsheet formula injection', () => {
  assert.equal(csv([['=HYPERLINK("bad")', 'A, B', 'normal']]), '"\'=HYPERLINK(""bad"")","A, B","normal"');
});
test('name search and attendance filters work together', () => {
  const guests = [{ name: 'Alex Santos', congregation: 'East', role: 'Attendee', table: 4, checkedInAt: null }, { name: 'Sam Rivera', congregation: 'North', role: 'Performer', table: 0, checkedInAt: 'now' }];
  assert.equal(filteredGuests(guests, 'table 4', 'waiting').length, 1);
  assert.equal(filteredGuests(guests, 'performer', 'arrived').length, 1);
  assert.equal(filteredGuests(guests, 'east', 'arrived').length, 0);
});
