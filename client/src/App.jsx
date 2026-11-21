import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import Admin from './Admin.jsx';

const ST = { W: 'Working', WO: 'Weekly off', PH: 'Public holiday', L: 'Leave', CO: 'Comp-off' };
const DN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dowOf = (d) => new Date(d + 'T00:00:00Z').getUTCDay();

export default function App() {
  const [page, setPage] = useState('roster');
  const [data, setData] = useState(null);
  const [month, setMonth] = useState('2026-12');
  const [r, setR] = useState(null);
  const [view, setView] = useState('company');
  const [sel, setSel] = useState('');
  const [edit, setEdit] = useState(null);
  const [impact, setImpact] = useState(null);
  const [warn, setWarn] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [lv, setLv] = useState({ employeeId: '', date: '', type: 'L' });

  const loadData = async () => {
    const [employees, brands, processes, pods, holidays, leaves] = await Promise.all(['employees', 'brands', 'processes', 'pods', 'holidays', 'leaves'].map((x) => api.get('/' + x)));
    setData({ employees, brands, processes, pods, holidays, leaves });
  };
  const loadRoster = async () => { try { setR(await api.get('/rosters/' + month)); } catch { setR(null); } };
  const refresh = async () => { await loadData(); await loadRoster(); };
  const run = async (fn) => { setErr(''); setBusy(true); try { await fn(); } catch (e) { setErr(e.message); } setBusy(false); };
  useEffect(() => { loadData().catch((e) => setErr(e.message)); }, []);
  useEffect(() => { loadRoster(); setImpact(null); setLv((l) => ({ ...l, date: `${month}-10` })); }, [month]);

  const brandName = (id) => data?.brands.find((b) => b.id === id)?.name ?? id;
  const podName = (id) => data?.pods.find((p) => p.id === id)?.name ?? id;
  const opts = useMemo(() => {
    if (!data) return [];
    return { company: [], pod: data.pods.map((p) => [p.id, p.name]), brand: data.brands.map((b) => [b.id, b.name]),
      process: data.processes.map((p) => [p.id, `${brandName(p.brandId)} / ${p.name}`]), employee: data.employees.map((e) => [e.id, e.name]) }[view];
  }, [data, view]);
  const cur = opts.some((o) => o[0] === sel) ? sel : opts[0]?.[0];

  const scoped = useMemo(() => {
    if (!data) return { emps: [], procs: [] };
    const E = data.employees, P = data.processes;
    let emps;
    if (view === 'company') emps = E;
    else if (view === 'pod') emps = E.filter((e) => e.podId === cur);
    else if (view === 'brand') { const ids = P.filter((p) => p.brandId === cur).map((p) => p.id); emps = E.filter((e) => e.processIds.some((i) => ids.includes(i))); }
    else if (view === 'process') emps = E.filter((e) => e.processIds.includes(cur));
    else emps = E.filter((e) => e.id === cur);
    const procs = view === 'brand' ? P.filter((p) => p.brandId === cur) : view === 'process' ? P.filter((p) => p.id === cur) : P.filter((p) => emps.some((e) => e.processIds.includes(p.id)));
    return { emps, procs };
  }, [data, view, cur]);

  if (!data) return <main>{err ? <div className="err">{err}</div> : 'Loading...'}</main>;

  const v = r?.validation;
  const issues = (v?.issues || []).filter((i) => (i.processId ? scoped.procs.some((p) => p.id === i.processId) : scoped.emps.some((e) => e.id === i.employeeId)))
    .filter((i) => warn || i.severity === 'error').sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
  const covProcs = r ? (view === 'company' || view === 'pod' ? scoped.procs.filter((p) => Object.values(v.coverage[p.id] || {}).some((c) => !c.ok)) : scoped.procs) : [];

  const generate = () => run(async () => { const [y, m] = month.split('-').map(Number); setR(await api.post('/rosters/generate', { year: y, month: m })); setImpact(null); });
  const setCell = (employeeId, date, status) => run(async () => { const res = await api.patch(`/rosters/${month}/cell`, { employeeId, date, status }); setR(res); setImpact(res.impact); setEdit(null); });
  const addLeave = () => run(async () => { const res = await api.post('/leaves', lv); setImpact(res.impact); if (res.roster && res.leave.date.startsWith(month)) setR(res.roster); await loadData(); });
  const reset = () => run(async () => { await api.post('/reset'); setImpact(null); await refresh(); });
  const csv = () => {
    const rows = [['Employee', 'Pod', ...r.meta.days], ...scoped.emps.map((e) => [e.name, podName(e.podId), ...r.meta.days.map((d) => r.roster[e.id][d])])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((x) => x.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = `roster-${month}-${view}.csv`; a.click();
  };

  const days = r?.meta.days || [];
  const head = (
    <tr><th className="name">{view === 'employee' ? 'Employee' : 'Employee (click a cell to edit)'}</th>
      {days.map((d) => <th key={d} className={(dowOf(d) === 0 ? 'sun ' : '') + (data.holidays.includes(d) ? 'hol' : '')} title={d}>{d.slice(8)}<br />{DN[dowOf(d)]}</th>)}</tr>
  );
  const emp = view === 'employee' ? scoped.emps[0] : null;

  return (
    <>
      <header>
        <h1>Smart Roster</h1>
        <nav><button className={page === 'roster' ? 'on' : ''} onClick={() => setPage('roster')}>Roster</button><button className={page === 'admin' ? 'on' : ''} onClick={() => setPage('admin')}>Setup (data and rules)</button></nav>
      </header>
      <main>
        {err && <div className="err">{err}</div>}
        {page === 'admin' ? <Admin data={data} onChange={refresh} /> : (<>
          <div className="bar">
            <label>Month <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
            <button className="pri" disabled={busy} onClick={generate}>{r ? 'Regenerate roster' : 'Generate roster'}</button>
            {r && <button onClick={csv}>Export CSV</button>}
            <button onClick={reset} disabled={busy}>Reset demo data</button>
            {v && <span className={'badge ' + (v.valid ? 'ok' : 'bad')}>{v.valid ? 'No blocking problems' : `${v.summary.errors} problems to fix`} · {v.summary.warnings} warnings</span>}
          </div>
          {!r && <div className="card">No roster for {month} yet. Click "Generate roster". (Sample data is set up for December 2026.)</div>}
          {r && (<>
            <div className="bar">
              <label>View <select value={view} onChange={(e) => setView(e.target.value)}>
                <option value="company">Company</option><option value="pod">Pod</option><option value="brand">Brand</option><option value="process">Process</option><option value="employee">Employee</option></select></label>
              {view !== 'company' && <select value={cur} onChange={(e) => setSel(e.target.value)}>{opts.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>}
              <span className="legend">{Object.entries(ST).map(([k, l]) => <span key={k} className={'s-' + k}>{k} = {l}</span>)}</span>
            </div>
            {impact && (
              <div className="card impact"><b>Impact of your last change:</b>{' '}
                {impact.introduced.length === 0 && impact.resolved.length === 0 && 'no change to problems.'}
                {impact.introduced.map((i) => <div key={i.key} className="badtxt">New problem: {i.message}</div>)}
                {impact.resolved.map((i) => <div key={i.key} className="good">Fixed: {i.message}</div>)}
                <button onClick={() => setImpact(null)}>Dismiss</button></div>
            )}
            {edit && <div className="card">Change <b>{edit.e.name}</b> on <b>{edit.d}</b>: {Object.entries(ST).map(([k, l]) => <button key={k} className={'s-' + k} onClick={() => setCell(edit.e.id, edit.d, k)}>{l}</button>)} <button onClick={() => setEdit(null)}>Cancel</button></div>}
            {emp && <div className="card"><b>{emp.name}</b> · {podName(emp.podId)} · weekly offs per week: {emp.weeklyOffs} · comp-off credits this month: {r.meta.compOffCredits[emp.id] ?? 0}<br />
              Works on: {emp.processIds.map((id) => data.processes.find((p) => p.id === id)).filter(Boolean).map((p) => `${brandName(p.brandId)} / ${p.name}`).join('; ') || 'no brand (floater / backup)'}<br />
              Weekly offs: {days.filter((d) => r.roster[emp.id][d] === 'WO').join(', ') || 'none'}<br />
              Leaves: {data.leaves.filter((l) => l.employeeId === emp.id && l.date.startsWith(month)).map((l) => `${l.date} (${l.type})`).join(', ') || 'none'}</div>}
            <div className="scroll"><table><thead>{head}</thead><tbody>
              {scoped.emps.map((e) => (
                <tr key={e.id}><td className="name">{e.name} <small>{podName(e.podId)}</small></td>
                  {days.map((d) => { const s = r.roster[e.id][d]; return <td key={d}><button className={'c s-' + s} title={`${e.name} ${d}: ${ST[s]}`} onClick={() => setEdit({ e, d })}>{s}</button></td>; })}</tr>
              ))}
              {covProcs.length > 0 && <tr><td className="name" colSpan={days.length + 1}><b>{view === 'company' || view === 'pod' ? 'Coverage (processes with gaps only)' : 'Coverage: people working / people required'}</b></td></tr>}
              {covProcs.map((p) => (
                <tr key={p.id}><td className="name">{brandName(p.brandId)} / {p.name}</td>
                  {days.map((d) => { const c = v.coverage[p.id]?.[d]; return <td key={d} className={'cov ' + (!c ? 'closed' : c.ok ? 'ok' : 'bad')} title={c ? '' : 'Process closed'}>{c ? `${c.working}/${c.required}` : '–'}</td>; })}</tr>
              ))}
            </tbody></table></div>
            <div className="grid2" style={{ marginTop: 12 }}>
              <div className="card"><div className="bar"><b>Problems in this view ({issues.length})</b><label><input type="checkbox" checked={warn} onChange={(e) => setWarn(e.target.checked)} /> show warnings</label></div>
                {issues.length === 0 && <div>Nothing to fix here.</div>}
                <ul className="issues">{issues.map((i) => (
                  <li key={i.key} className={i.severity}>{i.message}
                    {i.suggestions?.length > 0 && <div className="sug">Possible backup:
                      {i.suggestions.map((s) => s.rank === 0
                        ? <button key={s.employeeId} title={s.cost} onClick={() => setCell(s.employeeId, i.date, 'W')}>Call in {s.name} (already on this process)</button>
                        : <span key={s.employeeId}>{s.name} ({s.why}; add to this process first)</span>)}</div>}
                    {i.type === 'COVERAGE_GAP' && !(i.suggestions?.length) && <div className="sug">No backup is free this day. Change the rule, add staff, or cancel a leave.</div>}
                  </li>))}</ul></div>
              <div className="card form"><b>Add a leave (shows the impact on this roster)</b>
                <label>Employee <select value={lv.employeeId} onChange={(e) => setLv({ ...lv, employeeId: e.target.value })}><option value="">Choose...</option>{data.employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({podName(e.podId)})</option>)}</select></label>
                <label>Date <input type="date" value={lv.date} onChange={(e) => setLv({ ...lv, date: e.target.value })} /></label>
                <label>Type <select value={lv.type} onChange={(e) => setLv({ ...lv, type: e.target.value })}><option value="L">Leave</option><option value="CO">Comp-off</option></select></label>
                <button className="pri" disabled={!lv.employeeId || busy} onClick={addLeave}>Add leave</button>
                <p><small>Tip: pick someone who works alone on a brand, such as a single-employee brand, to see a gap appear.</small></p></div>
            </div>
          </>)}
        </>)}
      </main>
    </>
  );
}
