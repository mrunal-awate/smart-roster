import { useState } from 'react';
import { api } from './api';

const CAL = [['ALL_365', '365 days (incl. Sundays and holidays)'], ['DAILY_EXCEPT_HOLIDAYS', 'Every day except holidays'], ['OFF_SUN_AND_HOLIDAYS', 'Sundays and holidays off']];
const DOW = [['', 'None'], ...['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => [String(i), d])];
const toOv = (o) => Object.entries(o || {}).map(([d, n]) => `${d}=${n}`).join(', ');
const fromOv = (s) => Object.fromEntries(String(s || '').split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [d, n] = x.split('='); return [d.trim(), Number(n)]; }));

export default function Admin({ data, onChange }) {
  const [tab, setTab] = useState('employees');
  const [draft, setDraft] = useState(null);
  const [err, setErr] = useState('');
  const [hol, setHol] = useState(null);
  const bn = (id) => data.brands.find((b) => b.id === id)?.name ?? id;
  const fields = {
    employees: [{ k: 'name', l: 'Name' }, { k: 'podId', l: 'Pod', t: 'select', o: data.pods.map((p) => [p.id, p.name]) },
      { k: 'processIds', l: 'Works on (hold Ctrl or Cmd to pick several)', t: 'multi', o: data.processes.map((p) => [p.id, `${bn(p.brandId)} / ${p.name}`]) },
      { k: 'weeklyOffs', l: 'Weekly offs per week', t: 'number' }, { k: 'preferredOffDay', l: 'Preferred off day (soft wish)', t: 'dow', o: DOW }],
    processes: [{ k: 'name', l: 'Process name' }, { k: 'brandId', l: 'Brand', t: 'select', o: data.brands.map((b) => [b.id, b.name]) },
      { k: 'calendar', l: 'Operating calendar', t: 'select', o: CAL }, { k: 'minStaff', l: 'Minimum people needed per day', t: 'number' },
      { k: 'minStaffByDate', l: 'Special days, like 2026-12-25=2, 2026-12-31=3', t: 'ov' }],
    brands: [{ k: 'name', l: 'Brand name' }],
    pods: [{ k: 'name', l: 'Pod name' }, { k: 'leadId', l: 'Pod lead', t: 'select', o: [['', 'None'], ...data.employees.map((e) => [e.id, e.name])] }],
  };
  const save = async () => {
    setErr('');
    const d = { ...draft };
    for (const f of fields[tab]) {
      if (f.t === 'number') d[f.k] = Number(d[f.k]);
      if (f.t === 'dow') d[f.k] = d[f.k] === '' || d[f.k] == null ? null : Number(d[f.k]);
      if (f.t === 'ov') d[f.k] = typeof d[f.k] === 'string' ? fromOv(d[f.k]) : d[f.k] || {};
    }
    try { d.id && data[tab].some((x) => x.id === d.id) ? await api.put(`/${tab}/${d.id}`, d) : await api.post(`/${tab}`, d); setDraft(null); await onChange(); } catch (e) { setErr(e.message); }
  };
  const del = async (path) => { setErr(''); try { await api.del(path); await onChange(); } catch (e) { setErr(e.message); } };
  const show = (f, row) => {
    const v = row[f.k];
    if (f.t === 'multi') return (v || []).length + ' process(es)';
    if (f.t === 'select' || f.t === 'dow') return f.o.find((o) => String(o[0]) === String(v ?? ''))?.[1] ?? v;
    if (f.t === 'ov') return toOv(v);
    return v;
  };
  const startEdit = (row) => setDraft({ ...row, ...Object.fromEntries((fields[tab] || []).filter((f) => f.t === 'ov').map((f) => [f.k, toOv(row[f.k])])), ...(row.preferredOffDay == null ? { preferredOffDay: '' } : {}) });

  return (
    <div>
      <div className="bar">{['employees', 'processes', 'brands', 'pods', 'holidays', 'leaves'].map((t) => <button key={t} className={tab === t ? 'pri' : ''} onClick={() => { setTab(t); setDraft(null); setErr(''); setHol(null); }}>{t}</button>)}</div>
      <p><small>Changes here are rules and data, not code. After changing rules, go to Roster and click Regenerate roster so weekly offs are re-planned.</small></p>
      {err && <div className="err">{err}</div>}
      {fields[tab] && (<>
        <div className="card"><table className="tbl"><thead><tr>{fields[tab].map((f) => <th key={f.k}>{f.l.split(' (')[0].split(',')[0]}</th>)}<th /></tr></thead>
          <tbody>{data[tab].map((row) => <tr key={row.id}>{fields[tab].map((f) => <td key={f.k}>{show(f, row)}</td>)}
            <td><button onClick={() => startEdit(row)}>Edit</button> <button className="danger" onClick={() => del(`/${tab}/${row.id}`)}>Delete</button></td></tr>)}</tbody></table></div>
        <button className="pri" onClick={() => setDraft(tab === 'employees' ? { name: '', podId: data.pods[0]?.id, processIds: [], weeklyOffs: 1, preferredOffDay: '' } : tab === 'processes' ? { name: '', brandId: data.brands[0]?.id, calendar: 'OFF_SUN_AND_HOLIDAYS', minStaff: 1, minStaffByDate: '' } : tab === 'pods' ? { name: '', leadId: '' } : { name: '' })}>Add new</button>
        {draft && <div className="card form" style={{ marginTop: 10 }}><b>{draft.id ? 'Edit' : 'New'} {tab.slice(0, -1)}</b>
          {fields[tab].map((f) => <label key={f.k}>{f.l}
            {f.t === 'select' || f.t === 'dow' ? <select value={draft[f.k] ?? ''} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })}>{f.o.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              : f.t === 'multi' ? <select multiple size={6} value={draft[f.k] || []} onChange={(e) => setDraft({ ...draft, [f.k]: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{f.o.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                : <input type={f.t === 'number' ? 'number' : 'text'} value={draft[f.k] ?? ''} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })} />}</label>)}
          <button className="pri" onClick={save}>Save</button> <button onClick={() => setDraft(null)}>Cancel</button></div>}
      </>)}
      {tab === 'holidays' && <div className="card form"><label>Public holidays, one date per line (YYYY-MM-DD)
        <textarea rows={8} value={hol ?? data.holidays.join('\n')} onChange={(e) => setHol(e.target.value)} /></label>
        <button className="pri" onClick={async () => { setErr(''); try { await api.put('/holidays', hol.split('\n').map((x) => x.trim()).filter(Boolean)); setHol(null); await onChange(); } catch (e) { setErr(e.message); } }} disabled={hol === null}>Save holidays</button></div>}
      {tab === 'leaves' && <div className="card"><table className="tbl"><thead><tr><th>Employee</th><th>Date</th><th>Type</th><th /></tr></thead>
        <tbody>{[...data.leaves].sort((a, b) => a.date.localeCompare(b.date)).map((l) => <tr key={l.id}><td>{data.employees.find((e) => e.id === l.employeeId)?.name}</td><td>{l.date}</td><td>{l.type === 'L' ? 'Leave' : 'Comp-off'}</td>
          <td><button className="danger" onClick={() => del(`/leaves/${l.id}`)}>Cancel leave</button></td></tr>)}</tbody></table>
        <p><small>Add new leaves from the Roster page.</small></p></div>}
    </div>
  );
}
