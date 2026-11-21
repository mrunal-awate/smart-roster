import { validate } from './validate.js';
import { STATUS as S } from './rules.js';

// Compare two validation results: what got worse, what got fixed.
const diff = (before, after) => {
  const b = new Set(before.issues.map((i) => i.key)), a = new Set(after.issues.map((i) => i.key));
  return { introduced: after.issues.filter((i) => !b.has(i.key)), resolved: before.issues.filter((i) => !a.has(i.key)) };
};

// Manual edit of one cell. Roster is never mutated; the caller gets a new one plus the impact.
export function applyEdit(ctx, roster, days, employeeId, date, status) {
  const before = validate(ctx, roster, days);
  const next = structuredClone(roster);
  next[employeeId][date] = status;
  const after = validate(ctx, next, days);
  return { roster: next, validation: after, impact: diff(before, after) };
}

// New leave after the roster exists: update the rules AND the roster, then show the impact.
export function addLeave(ctx, roster, days, employeeId, date, type = S.LEAVE) {
  const before = validate(ctx, roster, days);
  const leaves = new Map(ctx.leaves).set(`${employeeId}|${date}`, type);
  const nextCtx = { ...ctx, leaves };
  const next = structuredClone(roster);
  next[employeeId][date] = type;
  const after = validate(nextCtx, next, days);
  return { ctx: nextCtx, roster: next, validation: after, impact: diff(before, after) };
}
