import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../src/engine/rules.js';
import { generate } from '../src/engine/generate.js';
import { validate } from '../src/engine/validate.js';
import { addLeave, applyEdit } from '../src/engine/changes.js';

const base = (employees, processes) => buildContext({
  brands: [{ id: 'b1', name: 'Brand One' }], employees, processes, holidays: ['2026-12-25'],
});
const run = (ctx) => { const g = generate(ctx, 2026, 12); return { ...g, v: validate(ctx, g.roster, g.days) }; };
const gaps = (v) => v.issues.filter((i) => i.type === 'COVERAGE_GAP');

test('single employee on a 365-day process: gaps are flagged, never hidden', () => {
  const ctx = base([{ id: 'e1', name: 'Asha', podId: 'p1', processIds: ['cs'] }], [{ id: 'cs', brandId: 'b1', name: 'CS', calendar: 'ALL_365', minStaff: 1 }]);
  const { v } = run(ctx);
  assert.equal(gaps(v).length, 4); // 4 weeks with 5+ days in Dec 2026, one forced off each
  assert.equal(v.valid, false);
});

test('two employees on a 365-day process: offs are staggered, no gaps', () => {
  const ctx = base([
    { id: 'e1', name: 'Asha', podId: 'p1', processIds: ['cs'] },
    { id: 'e2', name: 'Ravi', podId: 'p1', processIds: ['cs'] },
  ], [{ id: 'cs', brandId: 'b1', name: 'CS', calendar: 'ALL_365', minStaff: 1 }]);
  const { v } = run(ctx);
  assert.equal(gaps(v).length, 0);
  assert.equal(v.valid, true);
});

test('Sunday-and-holiday-off process: closed days need no coverage, Sunday counts as weekly off', () => {
  const ctx = base([{ id: 'e1', name: 'Asha', podId: 'p1', processIds: ['ndr'] }], [{ id: 'ndr', brandId: 'b1', name: 'NDR', calendar: 'OFF_SUN_AND_HOLIDAYS', minStaff: 1 }]);
  const { v, roster } = run(ctx);
  assert.equal(v.valid, true);
  assert.equal(roster.e1['2026-12-25'], 'PH');
  assert.equal(roster.e1['2026-12-06'], 'WO'); // a Sunday
});

test('leave added after generation creates a gap and suggests the colleague', () => {
  const ctx = base([
    { id: 'e1', name: 'Asha', podId: 'p1', processIds: ['cs'] },
    { id: 'e2', name: 'Ravi', podId: 'p1', processIds: ['cs'] },
  ], [{ id: 'cs', brandId: 'b1', name: 'CS', calendar: 'ALL_365', minStaff: 1 }]);
  const { roster, days } = run(ctx);
  const day = days.find((d) => roster.e2[d] === 'WO');          // Ravi's off day
  const res = addLeave(ctx, roster, days, 'e1', day);            // Asha takes leave the same day
  const gap = res.impact.introduced.find((i) => i.type === 'COVERAGE_GAP' && i.date === day);
  assert.ok(gap, 'new gap must be reported');
  assert.equal(gap.suggestions[0].employeeId, 'e2');
});

test('manual edit that puts someone to work during approved leave is rejected as an error', () => {
  const ctx = buildContext({ brands: [{ id: 'b1', name: 'Brand One' }], holidays: [], leaves: [{ employeeId: 'e1', date: '2026-12-10', type: 'L' }],
    employees: [{ id: 'e1', name: 'Asha', podId: 'p1', processIds: ['cs'] }, { id: 'e2', name: 'Ravi', podId: 'p1', processIds: ['cs'] }],
    processes: [{ id: 'cs', brandId: 'b1', name: 'CS', calendar: 'ALL_365', minStaff: 1 }] });
  const { roster, days } = run(ctx);
  assert.equal(roster.e1['2026-12-10'], 'L');
  const res = applyEdit(ctx, roster, days, 'e1', '2026-12-10', 'W');
  assert.ok(res.impact.introduced.some((i) => i.type === 'LEAVE_CONFLICT'));
});
