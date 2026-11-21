import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';
import { buildSeed } from '../src/seed.js';

const server = createApp(createStore(buildSeed())).listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
};
test.after(() => server.close());

test('seed data matches the brief: 30+ employees, 80% single-employee brands', async () => {
  const emps = (await call('GET', '/employees')).body, procs = (await call('GET', '/processes')).body, brands = (await call('GET', '/brands')).body;
  assert.ok(emps.length >= 30);
  const staff = brands.map((b) => new Set(emps.filter((e) => e.processIds.some((p) => procs.find((x) => x.id === p).brandId === b.id)).map((e) => e.id)).size);
  assert.equal(staff.filter((c) => c === 1).length / brands.length, 0.8);
  assert.ok(staff.every((c) => c <= 3));
});

test('generate: the deliberate 365-day single-employee brand is flagged, with backup suggestions', async () => {
  const res = await call('POST', '/rosters/generate', { year: 2026, month: 12 });
  const gaps = res.body.validation.issues.filter((i) => i.type === 'COVERAGE_GAP');
  assert.equal(gaps.filter((g) => g.processId === 's01-cs').length, 4);
  assert.ok(gaps.every((g) => g.suggestions.length > 0));
  assert.ok(gaps.some((g) => g.processId === 's05-cs' && g.date === '2026-12-10')); // planned leave, nobody to cover
  assert.equal(gaps.length, 5);                                                     // and nothing else is broken
});

test('rule change is validated instantly; regenerating then fixes the roster', async () => {
  await call('PUT', '/processes/s01-cs', { calendar: 'OFF_SUN_AND_HOLIDAYS' });
  // Old weekday offs now clash with the new Mon-Sat requirement, so the stale roster still shows gaps.
  const stale = await call('GET', '/rosters/2026-12');
  assert.ok(stale.body.validation.issues.some((i) => i.processId === 's01-cs'));
  const fresh = await call('POST', '/rosters/generate', { year: 2026, month: 12 });
  assert.equal(fresh.body.validation.issues.filter((i) => i.processId === 's01-cs').length, 0);
  await call('PUT', '/processes/s01-cs', { calendar: 'ALL_365' });
  await call('POST', '/rosters/generate', { year: 2026, month: 12 });
});

test('new leave after generation reports the new gap', async () => {
  const res = await call('POST', '/leaves', { employeeId: 'e14', date: '2026-12-16' }); // single-employee brand, Wednesday
  assert.equal(res.status, 201);
  assert.ok(res.body.impact.introduced.some((i) => i.type === 'COVERAGE_GAP' && i.date === '2026-12-16'));
});

test('manual edit is validated and invalid input is rejected', async () => {
  const ok = await call('PATCH', '/rosters/2026-12/cell', { employeeId: 'e14', date: '2026-12-16', status: 'W' });
  assert.ok(ok.body.impact.introduced.some((i) => i.type === 'LEAVE_CONFLICT'));
  assert.equal((await call('PATCH', '/rosters/2026-12/cell', { employeeId: 'e14', date: '2026-12-16', status: 'X' })).status, 400);
  assert.equal((await call('POST', '/processes', { brandId: 'nope', name: 'x', calendar: 'ALL_365' })).status, 400);
  assert.equal((await call('POST', '/processes', { brandId: 's01', name: 'x', calendar: 'WEEKENDS' })).status, 400);
});

test('cancelling a leave puts the day back to working; reset restores sample data', async () => {
  await call('POST', '/rosters/generate', { year: 2026, month: 12 });
  const leaves = (await call('GET', '/leaves')).body;
  const l3 = leaves.find((l) => l.id === 'l3');
  const res = await call('DELETE', '/leaves/l3');
  assert.ok(res.body.impact.resolved.some((i) => i.processId === 's05-cs' && i.date === l3.date));
  await call('POST', '/reset');
  assert.equal((await call('GET', '/leaves')).body.length, 3);
});
