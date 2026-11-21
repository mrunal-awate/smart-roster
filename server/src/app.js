import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { buildSeed } from './seed.js';
import cors from 'cors';
import { buildContext, CALENDARS, STATUS } from './engine/rules.js';
import { generate } from './engine/generate.js';
import { validate } from './engine/validate.js';
import { applyEdit, addLeave } from './engine/changes.js';
import { monthDays } from './engine/dates.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const uid = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function createApp(store, { clientDir } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());
  const db = () => store.db;
  const ctx = () => buildContext(db());
  const wrap = (fn) => (req, res) => { try { fn(req, res); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } };

  // Always validate against CURRENT data, so a rule change shows up without regenerating.
  const payload = (key) => {
    const r = db().rosters[key];
    const v = validate(ctx(), r.roster, r.days);
    return { meta: { key, year: r.year, month: r.month, days: r.days, compOffCredits: r.compOffCredits }, roster: r.roster, validation: v };
  };

  const rules = {
    employees: (e) => {
      if (!e.name) throw fail('name is required');
      if (!db().pods.some((p) => p.id === e.podId)) throw fail('podId does not exist');
      e.processIds = e.processIds || [];
      if (e.processIds.some((id) => !db().processes.some((p) => p.id === id))) throw fail('processIds contains an unknown process');
      e.weeklyOffs = e.weeklyOffs ?? 1;
    },
    processes: (p) => {
      if (!p.name) throw fail('name is required');
      if (!db().brands.some((b) => b.id === p.brandId)) throw fail('brandId does not exist');
      if (!CALENDARS.includes(p.calendar)) throw fail(`calendar must be one of ${CALENDARS.join(', ')}`);
      p.minStaff = p.minStaff ?? 1;
      if (!Number.isInteger(p.minStaff) || p.minStaff < 1) throw fail('minStaff must be a whole number, 1 or more');
    },
    brands: (b) => { if (!b.name) throw fail('name is required'); },
    pods: (p) => { if (!p.name) throw fail('name is required'); },
  };
  const cleanup = {
    processes: (id) => db().employees.forEach((e) => { e.processIds = e.processIds.filter((x) => x !== id); }),
    brands: (id) => { if (db().processes.some((p) => p.brandId === id)) throw fail('Delete or move the brand\'s processes first', 409); },
    pods: (id) => { if (db().employees.some((e) => e.podId === id)) throw fail('Move the pod\'s employees first', 409); },
  };

  for (const name of Object.keys(rules)) {
    app.get(`/api/${name}`, (q, r) => r.json(db()[name]));
    app.post(`/api/${name}`, wrap((q, r) => {
      const item = { ...q.body, id: q.body.id || uid(name[0]) };
      if (db()[name].some((x) => x.id === item.id)) throw fail('id already exists', 409);
      rules[name](item); db()[name].push(item); store.save(); r.status(201).json(item);
    }));
    app.put(`/api/${name}/:id`, wrap((q, r) => {
      const i = db()[name].findIndex((x) => x.id === q.params.id);
      if (i < 0) throw fail('not found', 404);
      const item = { ...db()[name][i], ...q.body, id: q.params.id };
      rules[name](item); db()[name][i] = item; store.save(); r.json(item);
    }));
    app.delete(`/api/${name}/:id`, wrap((q, r) => {
      const i = db()[name].findIndex((x) => x.id === q.params.id);
      if (i < 0) throw fail('not found', 404);
      cleanup[name]?.(q.params.id); db()[name].splice(i, 1); store.save(); r.status(204).end();
    }));
  }

  app.get('/api/holidays', (q, r) => r.json(db().holidays));
  app.put('/api/holidays', wrap((q, r) => {
    if (!Array.isArray(q.body) || q.body.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw fail('send an array of YYYY-MM-DD dates');
    db().holidays = [...new Set(q.body)].sort(); store.save(); r.json(db().holidays);
  }));
  app.get('/api/leaves', (q, r) => r.json(db().leaves));

  app.post('/api/rosters/generate', wrap((q, r) => {
    const { year, month } = q.body;
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) throw fail('year and month (1-12) are required');
    const g = generate(ctx(), year, month);
    db().rosters[ym(year, month)] = { year, month, ...g };
    store.save(); r.json(payload(ym(year, month)));
  }));
  app.get('/api/rosters/:key', wrap((q, r) => { if (!db().rosters[q.params.key]) throw fail('No roster for this month. Generate it first.', 404); r.json(payload(q.params.key)); }));

  app.patch('/api/rosters/:key/cell', wrap((q, r) => {
    const roster = db().rosters[q.params.key];
    if (!roster) throw fail('No roster for this month', 404);
    const { employeeId, date, status } = q.body;
    if (!Object.values(STATUS).includes(status)) throw fail(`status must be one of ${Object.values(STATUS).join(', ')}`);
    if (!roster.roster[employeeId]?.[date]) throw fail('employee/date not in this roster');
    const res = applyEdit(ctx(), roster.roster, roster.days, employeeId, date, status);
    roster.roster = res.roster; store.save();
    r.json({ ...payload(q.params.key), impact: res.impact });
  }));

  app.post('/api/leaves', wrap((q, r) => {
    const { employeeId, date, type = 'L' } = q.body;
    if (!db().employees.some((e) => e.id === employeeId)) throw fail('unknown employee');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !['L', 'CO'].includes(type)) throw fail('date (YYYY-MM-DD) and type (L or CO) required');
    if (db().leaves.some((l) => l.employeeId === employeeId && l.date === date)) throw fail('leave already exists', 409);
    const key = date.slice(0, 7), roster = db().rosters[key];
    let impact = null;
    if (roster) { const res = addLeave(ctx(), roster.roster, roster.days, employeeId, date, type); roster.roster = res.roster; impact = res.impact; }
    const leave = { id: uid('l'), employeeId, date, type };
    db().leaves.push(leave); store.save();
    r.status(201).json({ leave, impact, roster: roster ? payload(key) : null });
  }));

  app.delete('/api/leaves/:id', wrap((q, r) => {
    const i = db().leaves.findIndex((l) => l.id === q.params.id);
    if (i < 0) throw fail('not found', 404);
    const [leave] = db().leaves.splice(i, 1);
    const roster = db().rosters[leave.date.slice(0, 7)];
    let impact = null;
    // The day goes back to Working; the validator then shows anything that is now wrong (e.g. no weekly off).
    if (roster && ['L', 'CO'].includes(roster.roster[leave.employeeId]?.[leave.date])) {
      const res = applyEdit(ctx(), roster.roster, roster.days, leave.employeeId, leave.date, 'W');
      roster.roster = res.roster; impact = res.impact;
    }
    store.save(); r.json({ impact });
  }));

  // Restore the sample data (used before recording the demo).
  app.post('/api/reset', wrap((q, r) => { store.db = buildSeed(); store.save(); r.json({ ok: true }); }));

  if (clientDir && fs.existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.get(/^\/(?!api).*/, (q, r) => r.sendFile(path.join(clientDir, 'index.html')));
  }
  return app;
}
