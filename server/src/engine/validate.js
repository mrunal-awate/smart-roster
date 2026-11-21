import { dow, groupWeeks } from './dates.js';
import { STATUS as S, isOperating, requiredStaff, procsOf, countWorking, restInWeek, MIN_DAYS_FOR_WEEKLY_OFF } from './rules.js';

const NAMES = { [S.WEEKLY_OFF]: 'weekly off', [S.PUBLIC_HOLIDAY]: 'public holiday', [S.LEAVE]: 'leave', [S.COMP_OFF]: 'comp-off' };

// Who could be called in to cover? Best candidates first.
export function suggestBackups(ctx, roster, process, date) {
  const out = [];
  for (const e of ctx.employees) {
    const st = roster[e.id]?.[date];
    if (st !== S.WEEKLY_OFF && st !== S.PUBLIC_HOLIDAY) continue; // never suggest someone on leave/comp-off or already working
    const assigned = (e.processIds || []).includes(process.id);
    const sameBrand = procsOf(ctx, e).some((p) => p.brandId === process.brandId);
    const samePod = ctx.empsByProcess.get(process.id).some((x) => x.podId === e.podId);
    const floater = !(e.processIds || []).length;
    const rank = assigned ? 0 : sameBrand ? 1 : samePod ? 2 : floater ? 3 : 4;
    const why = ['already assigned to this process', 'works on the same brand', 'same pod', 'floater (no brand)', 'other pod, needs training'][rank];
    out.push({ employeeId: e.id, name: e.name, rank, why, cost: `loses their ${NAMES[st]}; give a comp-off later` });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, 5);
}

export function validate(ctx, roster, days, { suggest = true } = {}) {
  const issues = [];
  const coverage = {};
  const add = (i) => issues.push(i);
  const label = (p) => `${ctx.brandById.get(p.brandId)?.name ?? p.brandId} / ${p.name}`;

  // HARD: coverage per process per operating day
  for (const p of ctx.processes) {
    coverage[p.id] = {};
    const team = ctx.empsByProcess.get(p.id);
    for (const d of days) {
      if (!isOperating(p, d, ctx.holidays)) continue;
      const required = requiredStaff(p, d), working = countWorking(ctx, roster, p, d);
      coverage[p.id][d] = { required, working, ok: working >= required };
      if (working >= required) continue;
      const reasons = team.filter((e) => roster[e.id]?.[d] !== S.WORK)
        .map((e) => `${e.name}: ${NAMES[roster[e.id][d]] ?? roster[e.id][d]}`);
      add({
        key: `GAP|${d}|${p.id}`, severity: 'error', type: 'COVERAGE_GAP', date: d, processId: p.id,
        message: `${label(p)} needs ${required} on ${d} but only ${working} working.` + (team.length ? ` Not working: ${reasons.join(', ')}.` : ' Nobody is assigned to this process.'),
        suggestions: suggest ? suggestBackups(ctx, roster, p, d) : undefined,
      });
    }
  }

  const weeks = groupWeeks(days);
  for (const e of ctx.employees) {
    const row = roster[e.id] || {};
    // HARD: working while on approved leave / comp-off
    for (const d of days) {
      const lv = ctx.leaves.get(`${e.id}|${d}`);
      if (lv && row[d] === S.WORK) add({ key: `LEAVE|${d}|${e.id}`, severity: 'error', type: 'LEAVE_CONFLICT', date: d, employeeId: e.id, message: `${e.name} is scheduled to work on ${d} but has approved ${NAMES[lv]}.` });
    }
    // HARD: weekly off per week (leave counts as rest)
    for (const [wk, wdays] of weeks) {
      if (wdays.length < MIN_DAYS_FOR_WEEKLY_OFF) continue;
      const rest = restInWeek(ctx, e, row, wk, wdays);
      if (rest < (e.weeklyOffs ?? 1)) add({ key: `WO|${wk}|${e.id}`, severity: 'error', type: 'WEEKLY_OFF_MISSING', date: wk, employeeId: e.id, message: `${e.name} has no weekly off in the week starting ${wk}.` });
    }
    // SOFT: preferred off day
    if (e.preferredOffDay != null) {
      const offs = days.filter((d) => row[d] === S.WEEKLY_OFF);
      const miss = offs.filter((d) => dow(d) !== e.preferredOffDay);
      if (miss.length) add({ key: `PREF|${e.id}`, severity: 'warning', type: 'PREFERENCE_NOT_MET', employeeId: e.id, message: `${e.name}'s weekly off is not on the preferred day for ${miss.length} of ${offs.length} offs.` });
    }
    // SOFT: more than 6 days in a row
    let run = 0;
    for (const d of days) {
      run = row[d] === S.WORK ? run + 1 : 0;
      if (run === 7) add({ key: `STREAK|${d}|${e.id}`, severity: 'warning', type: 'LONG_STREAK', date: d, employeeId: e.id, message: `${e.name} works 7+ days in a row ending around ${d}.` });
    }
  }
  const summary = { errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length };
  return { issues, coverage, summary, valid: summary.errors === 0 };
}
