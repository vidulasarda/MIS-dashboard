'use client';
import { useEffect, useState } from 'react';
import { MsmeUploadForm } from '@/app/components/MsmeUploadForm';

type Tab = 'update' | 'edit' | 'access';

const PL_FIELDS: [string, string][] = [
  ['revenue', 'Revenue from operations'], ['otherIncome', 'Other income'], ['purchases', 'Purchases'],
  ['directExpenses', 'Direct expenses'], ['changeInInventories', 'Change in inventories (opening − closing)'],
  ['depreciation', 'Depreciation'], ['financeCost', 'Finance cost'], ['otherExpenses', 'Other expenses (incl. employee cost)'], ['tax', 'Tax'],
];
const BS_FIELDS: [string, string][] = [
  ['ownersCapital', 'Capital & reserves (net worth)'], ['securedLoans', 'Secured loans (long-term)'], ['unsecuredLoans', 'Unsecured loans (long-term)'],
  ['deferredTaxLiab', 'Deferred tax liability'], ['stBorrowings', 'Short-term borrowings'], ['tradePayables', 'Trade payables'],
  ['otherCL', 'Other current liabilities'], ['stProvisions', 'Short-term provisions'], ['ppe', 'Fixed assets (PPE)'],
  ['investments', 'Investments'], ['inventories', 'Inventories'], ['receivables', 'Trade receivables'], ['cash', 'Cash & bank'], ['otherCA', 'Other current assets'],
];
const TOTAL_FIELDS: [string, string][] = [['totalIncome', 'Total income'], ['totalExpenses', 'Total expenses'], ['pbt', 'Profit before tax'], ['pat', 'Profit after tax']];

const fmt = (n: any) => (typeof n === 'number' ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '');

export default function ManagePanel({ companyId, name, onChanged, onClose }: { companyId: string; name: string; onChanged: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('update');
  return (
    <div className="fixed inset-0 bg-black/40 z-50 overflow-y-auto print:hidden" onClick={onClose}>
      <div className="max-w-3xl mx-auto my-8 bg-paper rounded-lg shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="font-display font-semibold text-xl">Manage — {name}</h2>
            <p className="text-xs text-inksoft">Admin only. Clients cannot see this screen.</p>
          </div>
          <button onClick={onClose} className="text-inksoft text-xl leading-none px-2">×</button>
        </div>
        <div className="flex gap-2 mb-5 border-b border-rule pb-3">
          {([['update', 'Upload new data'], ['edit', 'Edit details & figures'], ['access', 'Client access']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3.5 py-1.5 rounded text-sm font-semibold transition ${tab === k ? 'bg-ink text-paper' : 'bg-card border border-rule text-inksoft hover:border-brass'}`}>{l}</button>
          ))}
        </div>
        {tab === 'update' && <MsmeUploadForm companyId={companyId} onDone={() => { onChanged(); onClose(); }} />}
        {tab === 'edit' && <EditTab companyId={companyId} name={name} onChanged={onChanged} />}
        {tab === 'access' && <AccessTab companyId={companyId} />}
      </div>
    </div>
  );
}

/* ---------------- edit company details + line items ---------------- */
function EditTab({ companyId, name, onChanged }: { companyId: string; name: string; onChanged: () => void }) {
  const [nm, setNm] = useState(name);
  const [curLabel, setCurLabel] = useState('');
  const [prevLabel, setPrevLabel] = useState('');
  const [curEnd, setCurEnd] = useState('');
  const [prevEnd, setPrevEnd] = useState('');
  const [raw, setRaw] = useState<any>(null);
  const [cur, setCur] = useState<Record<string, string>>({});
  const [prev, setPrev] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/companies/${companyId}/data`).then((r) => r.json()).then((d) => {
      setRaw(d); setCurLabel(d.currentLabel); setPrevLabel(d.previousLabel);
      const toS = (o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v ?? 0)]));
      setCur(toS(d.current)); setPrev(toS(d.previous));
    }).catch(() => setErr('Could not load figures'));
  }, [companyId]);

  async function save() {
    setSaving(true); setErr(null); setMsg(null);
    const nums = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(String(v).replace(/,/g, '') || 0)]));
    try {
      const r1 = await fetch(`/api/companies/${companyId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nm, currentLabel: curLabel, previousLabel: prevLabel, currentEnd: curEnd, previousEnd: prevEnd }) });
      const r2 = await fetch(`/api/companies/${companyId}/data`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: nums(cur), previous: nums(prev) }) });
      if (!r1.ok || !r2.ok) { const d = await (r1.ok ? r2 : r1).json().catch(() => ({})); setErr(d.error ?? 'Save failed'); return; }
      setMsg('Saved. Subtotals and profit were recalculated from the lines.');
      onChanged();
    } catch { setErr('Save failed'); } finally { setSaving(false); }
  }

  if (!raw) return <p className="text-sm text-inksoft">{err ?? 'Loading…'}</p>;

  const input = (state: Record<string, string>, set: (v: Record<string, string>) => void, k: string) => (
    <input value={state[k] ?? ''} onChange={(e) => set({ ...state, [k]: e.target.value })} inputMode="decimal"
      className="w-full border border-rule rounded px-2 py-1 bg-[#FBF8EF] text-right font-mono text-xs" />
  );
  const section = (title: string, fields: [string, string][]) => (
    <>
      <tr><td colSpan={3} className="pt-4 pb-1 text-xs font-semibold uppercase text-inksoft">{title}</td></tr>
      {fields.map(([k, l]) => (
        <tr key={k}><td className="py-0.5 pr-3 text-sm">{l}</td><td className="w-36 py-0.5 pr-2">{input(cur, setCur, k)}</td><td className="w-36 py-0.5">{input(prev, setPrev, k)}</td></tr>
      ))}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="text-xs font-semibold text-inksoft uppercase">Company name</label>
          <input value={nm} onChange={(e) => setNm(e.target.value)} className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" /></div>
        <div><label className="text-xs font-semibold text-inksoft uppercase">Current period label</label>
          <input value={curLabel} onChange={(e) => setCurLabel(e.target.value)} className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" /></div>
        <div><label className="text-xs font-semibold text-inksoft uppercase">Current period end (blank = keep)</label>
          <input type="date" value={curEnd} onChange={(e) => setCurEnd(e.target.value)} className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" /></div>
        <div><label className="text-xs font-semibold text-inksoft uppercase">Previous period label</label>
          <input value={prevLabel} onChange={(e) => setPrevLabel(e.target.value)} className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" /></div>
        <div><label className="text-xs font-semibold text-inksoft uppercase">Previous period end (blank = keep)</label>
          <input type="date" value={prevEnd} onChange={(e) => setPrevEnd(e.target.value)} className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" /></div>
      </div>
      <div className="max-h-[50vh] overflow-y-auto border border-rule rounded p-3">
        <table className="w-full">
          <thead><tr><th className="text-left text-xs uppercase text-inksoft">Line (₹)</th><th className="text-right text-xs uppercase text-inksoft pr-2">{curLabel}</th><th className="text-right text-xs uppercase text-inksoft">{prevLabel}</th></tr></thead>
          <tbody>
            {section('Profit & loss', PL_FIELDS)}
            {section('Balance sheet', BS_FIELDS)}
            <tr><td colSpan={3} className="pt-4 pb-1 text-xs font-semibold uppercase text-inksoft">Calculated (not editable)</td></tr>
            {TOTAL_FIELDS.map(([k, l]) => (
              <tr key={k} className="text-inksoft"><td className="py-0.5 text-sm">{l}</td><td className="text-right font-mono text-xs pr-4">{fmt(raw.current[k])}</td><td className="text-right font-mono text-xs pr-2">{fmt(raw.previous[k])}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <p className="text-oxblood text-sm">{err}</p>}
      {msg && <p className="text-forest text-sm">{msg}</p>}
      <button onClick={save} disabled={saving} className="bg-brassdark text-white font-semibold px-4 py-2 rounded hover:bg-ink transition disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
    </div>
  );
}

/* ---------------- client logins ---------------- */
function AccessTab({ companyId }: { companyId: string }) {
  const [users, setUsers] = useState<{ id: string; email: string }[] | null>(null);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = () => fetch(`/api/companies/${companyId}/access`).then((r) => r.json()).then(setUsers).catch(() => setErr('Could not load logins'));
  useEffect(() => { load(); }, [companyId]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setShown(null);
    const res = await fetch(`/api/companies/${companyId}/access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw || undefined }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error ?? 'Could not create login'); return; }
    setShown({ email: d.email, password: d.password }); setEmail(''); setPw(''); load();
  }
  async function reset(u: { id: string; email: string }) {
    if (!confirm(`Reset the password for ${u.email}?`)) return;
    const res = await fetch(`/api/companies/${companyId}/access/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setShown({ email: u.email, password: d.password });
  }
  async function remove(u: { id: string; email: string }) {
    if (!confirm(`Remove access for ${u.email}? They will no longer be able to log in.`)) return;
    await fetch(`/api/companies/${companyId}/access/${u.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-4 text-sm">
      <p className="text-inksoft">Each person gets their own login. They see <b>only this company</b> and can re-upload ageing / financial files. They cannot see other companies, edit figures, or manage logins.</p>
      <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[12rem]"><label className="text-xs font-semibold text-inksoft uppercase">Client email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" /></div>
        <div className="w-44"><label className="text-xs font-semibold text-inksoft uppercase">Password (blank = auto)</label>
          <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="min 8 characters" className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" /></div>
        <button className="bg-brassdark text-white font-semibold px-4 py-2 rounded hover:bg-ink transition">Add login</button>
      </form>
      {err && <p className="text-oxblood">{err}</p>}
      {shown && (
        <div className="bg-amberbg border border-amber rounded p-3">
          <b>Share these details with the client now — the password is shown only once.</b>
          <div className="font-mono mt-1">Email: {shown.email}<br />Password: {shown.password}</div>
          <div className="mt-1 text-xs text-inksoft">Login page: {typeof window !== 'undefined' ? window.location.origin : ''}/login</div>
        </div>
      )}
      <div>
        <h3 className="font-semibold mb-1">Current logins</h3>
        {users === null && <p className="text-inksoft">Loading…</p>}
        {users?.length === 0 && <p className="text-inksoft">No client logins yet.</p>}
        <ul className="divide-y divide-rule border border-rule rounded">
          {users?.map((u) => (
            <li key={u.id} className="flex justify-between items-center px-3 py-2">
              <span>{u.email}</span>
              <span className="space-x-3 text-xs">
                <button onClick={() => reset(u)} className="text-brassdark underline">Reset password</button>
                <button onClick={() => remove(u)} className="text-oxblood underline">Remove</button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
