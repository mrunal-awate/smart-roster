import { dow, iso } from './dates.js';

export const STATUS = { WORK: 'W', WEEKLY_OFF: 'WO', PUBLIC_HOLIDAY: 'PH', LEAVE: 'L', COMP_OFF: 'CO' };
// A week needs its own weekly off only if at least this many of its days fall in the month.
// Shorter edge weeks are assumed to get their off in the neighbouring month.
export const MIN_DAYS_FOR_WEEKLY_OFF = 5;
export const CALENDARS = ['ALL_365', 'DAILY_EXCEPT_HOLIDAYS', 'OFF_SUN_AND_HOLIDAYS'];

// PROCESS-level question: does this process need coverage on this date?
export function isOperating(process, date, holidays) {
  const hol = holidays.has(date);
  switch (process.calendar) {
    case 'ALL_365': return true;
    case 'DAILY_EXCEPT_HOLIDAYS': return !hol;
    case 'OFF_SUN_AND_HOLIDAYS': return !hol && dow(date) !== 0;
    default: throw new Error(`Unknown calendar "${process.calendar}" on process ${process.id}`);
  }
}
export const requiredStaff = (p, date) => p.minStaffByDate?.[date] ?? p.minStaff ?? 1;

// Turns raw data into lookup tables so the engine never searches arrays repeatedly.
export function buildContext({ employees, brands, processes, holidays = [], leaves = [] }) {
  const processById = new Map(processes.map((p) => [p.id, p]));
  const brandById = new Map(brands.map((b) => [b.id, b]));
  const empsByProcess = new Map(processes.map((p) => [p.id, []]));
  for (const e of employees) for (const pid of e.processIds || []) empsByProcess.get(pid)?.push(e);
  return {
    employees, brands, processes, processById, brandById, empsByProcess,
    holidays: new Set(holidays),
    leaves: new Map(leaves.map((l) => [`${l.employeeId}|${l.date}`, l.type])),
  };
}
export const procsOf = (ctx, e) => (e.processIds || []).map((id) => ctx.processById.get(id)).filter(Boolean);
export const countWorking = (ctx, roster, p, d) =>
  ctx.empsByProcess.get(p.id).filter((e) => roster[e.id]?.[d] === STATUS.WORK).length;

// Is this date a natural off for the employee (all their processes closed, not a holiday)?
export function isNaturalOff(ctx, e, d) {
  const procs = procsOf(ctx, e);
  const hol = ctx.holidays.has(d);
  const operating = procs.length ? procs.some((p) => isOperating(p, d, ctx.holidays)) : !hol && dow(d) !== 0;
  return !operating && !hol;
}
// Rest days a week already has: weekly offs / leave inside the month, plus natural offs
// that fall in the part of the week outside the month (e.g. the Sunday after 31 Dec).
export function restInWeek(ctx, e, row, wk, wdays) {
  let n = wdays.filter((d) => ['WO', 'L', 'CO'].includes(row[d])).length;
  const start = new Date(wk + 'T00:00:00Z');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() + i);
    const s = iso(d);
    if (!wdays.includes(s) && isNaturalOff(ctx, e, s)) n++;
  }
  return n;
}
