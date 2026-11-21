import { monthDays, dow, groupWeeks } from './dates.js';
import { STATUS as S, isOperating, requiredStaff, procsOf, countWorking, restInWeek, MIN_DAYS_FOR_WEEKLY_OFF } from './rules.js';

// Employees with the least spare capacity are planned first (single-employee brands),
// so they get the best choice of weekly-off day.
const slack = (ctx, e) => {
  const ps = procsOf(ctx, e);
  return ps.length ? Math.min(...ps.map((p) => ctx.empsByProcess.get(p.id).length - (p.minStaff ?? 1))) : 99;
};

export function generate(ctx, year, month) {
  const days = monthDays(year, month);
  const roster = {};
  const compOffCredits = {};

  // PASS 1: fixed facts. Leave, comp-off, holidays, and days where the employee's processes are closed.
  for (const e of ctx.employees) {
    roster[e.id] = {};
    compOffCredits[e.id] = 0;
    const procs = procsOf(ctx, e);
    for (const d of days) {
      const leave = ctx.leaves.get(`${e.id}|${d}`);
      if (leave) { roster[e.id][d] = leave; continue; }
      const hol = ctx.holidays.has(d);
      // Floaters (no assignments) work Mon-Sat except holidays.
      const operating = procs.length ? procs.some((p) => isOperating(p, d, ctx.holidays)) : !hol && dow(d) !== 0;
      if (operating) { roster[e.id][d] = S.WORK; if (hol) compOffCredits[e.id]++; }
      else roster[e.id][d] = hol ? S.PUBLIC_HOLIDAY : S.WEEKLY_OFF;
    }
  }

  // PASS 2: weekly offs. Hard rule (coverage) first, then soft rules (preference, fairness).
  const weeks = groupWeeks(days);
  const order = [...ctx.employees].sort((a, b) => slack(ctx, a) - slack(ctx, b));
  const offCountOnDay = {}; // fairness: spread offs across days
  for (const e of order) {
    const procs = procsOf(ctx, e);
    for (const [wk, wdays] of weeks) {
      if (wdays.length < MIN_DAYS_FOR_WEEKLY_OFF) continue;
      const need = e.weeklyOffs ?? 1;
      let have = restInWeek(ctx, e, roster[e.id], wk, wdays);
      while (have < need) {
        const cands = wdays.filter((d) => roster[e.id][d] === S.WORK);
        if (!cands.length) break;
        const score = (d) => [
          procs.filter((p) => isOperating(p, d, ctx.holidays) && countWorking(ctx, roster, p, d) - 1 < requiredStaff(p, d)).length, // harm
          e.preferredOffDay != null && dow(d) !== e.preferredOffDay ? 1 : 0, // preference
          offCountOnDay[d] || 0, // fairness
        ];
        cands.sort((a, b) => { const x = score(a), y = score(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.localeCompare(b); });
        roster[e.id][cands[0]] = S.WEEKLY_OFF;
        offCountOnDay[cands[0]] = (offCountOnDay[cands[0]] || 0) + 1;
        have++;
      }
    }
  }
  return { days, roster, compOffCredits };
}
