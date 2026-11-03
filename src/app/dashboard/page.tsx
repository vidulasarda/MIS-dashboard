'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface CompanyListItem {
  id: string;
  name: string;
  type: 'MSME' | 'STARTUP';
  updatedAt: string;
  hasFinancials: boolean;
  currentLabel: string | null;
}

export default function DashboardPage() {
  const [companies, setCompanies] = useState<CompanyListItem[] | null>(null);
  const [uploadType, setUploadType] = useState<'none' | 'MSME' | 'STARTUP'>('none');
  const router = useRouter();

  async function loadCompanies() {
    const res = await fetch('/api/companies');
    setCompanies(await res.json());
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8 border-b-2 border-ink pb-4">
        <h1 className="font-display font-semibold text-2xl">MIS Dashboard</h1>
        <p className="text-inksoft text-sm">Upload a template, Tally trial balance or signed PDF to generate an instant MIS dashboard.{' '}
          <a href="/MIS_Standard_Upload_Template.xlsx" download className="text-brassdark underline">Download the standard upload template</a>
        </p>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setUploadType(uploadType === 'MSME' ? 'none' : 'MSME')}
          className={`font-semibold px-5 py-2.5 rounded transition ${uploadType === 'MSME' ? 'bg-brassdark text-white' : 'bg-ink text-paper hover:bg-brassdark'}`}
        >
          {uploadType === 'MSME' ? 'Cancel' : '+ Upload MSME company'}
        </button>
        <button
          onClick={() => setUploadType(uploadType === 'STARTUP' ? 'none' : 'STARTUP')}
          className={`font-semibold px-5 py-2.5 rounded transition ${uploadType === 'STARTUP' ? 'bg-violet text-white' : 'border border-violet text-violet hover:bg-violet hover:text-white'}`}
        >
          {uploadType === 'STARTUP' ? 'Cancel' : '+ Upload Startup company'}
        </button>
      </div>

      {uploadType === 'MSME' && (
        <MsmeUploadForm onDone={(id) => { setUploadType('none'); router.push(`/company/${id}`); }} />
      )}
      {uploadType === 'STARTUP' && (
        <StartupUploadForm onDone={(id) => { setUploadType('none'); router.push(`/startup/${id}`); }} />
      )}

      <h2 className="font-display font-semibold text-lg mt-8 mb-3">Companies</h2>
      {companies === null && <p className="text-inksoft text-sm">Loading…</p>}
      {companies?.length === 0 && <p className="text-inksoft text-sm">No companies yet — upload one above to get started.</p>}
      <div className="space-y-2">
        {companies?.map((c) => (
          <a
            key={c.id}
            href={c.type === 'STARTUP' ? `/startup/${c.id}` : `/company/${c.id}`}
            className="card p-4 flex justify-between items-center hover:border-brass transition block"
          >
            <div>
              <div className="font-semibold flex items-center gap-2">
                {c.name}
                <span className={`stamp ${c.type === 'STARTUP' ? 'info' : 'good'}`}>{c.type}</span>
              </div>
              <div className="text-inksoft text-xs font-mono">
                {c.hasFinancials ? (c.currentLabel ? `Latest period: ${c.currentLabel}` : 'Data loaded') : 'No financials uploaded yet'}
              </div>
            </div>
            <span className="text-brassdark text-sm">View →</span>
          </a>
        ))}
      </div>
    </main>
  );
}

function MsmeUploadForm({ onDone }: { onDone: (companyId: string) => void }) {
  const [companyName, setCompanyName] = useState('');
  const [currentLabel, setCurrentLabel] = useState('');
  const [currentEnd, setCurrentEnd] = useState('');
  const [previousLabel, setPreviousLabel] = useState('');
  const [previousEnd, setPreviousEnd] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [prevFiles, setPrevFiles] = useState<FileList | null>(null);
  const [closingStock, setClosingStock] = useState('');
  const [prevClosingStock, setPrevClosingStock] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertNotes, setConvertNotes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function buildForm() {
    const form = new FormData();
    for (const f of Array.from(files ?? [])) form.append('files', f);
    for (const f of Array.from(prevFiles ?? [])) form.append('previousFiles', f);
    form.append('closingStock', closingStock);
    form.append('previousClosingStock', prevClosingStock);
    return form;
  }

  /** Reads the trial balance / PDF and downloads the standard template pre-filled, for review in Excel. */
  async function convert() {
    if (!files?.length) { setError('Choose a trial balance or PDF first'); return; }
    setConverting(true); setError(null); setConvertNotes(null);
    try {
      const res = await fetch('/api/convert', { method: 'POST', body: buildForm() });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? `Conversion failed (HTTP ${res.status})`); return; }
      try { setConvertNotes(JSON.parse(decodeURIComponent(res.headers.get('X-Convert-Notes') ?? '[]'))); } catch { setConvertNotes([]); }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'MIS_Template_Prefilled.xlsx'; a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally { setConverting(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!files?.length) { setError('Choose at least one file'); return; }
    setLoading(true);
    setError(null);
    const form = buildForm();
    form.append('companyName', companyName);
    form.append('currentPeriodLabel', currentLabel || 'Current');
    form.append('currentPeriodEnd', currentEnd);
    form.append('previousPeriodLabel', previousLabel || 'Previous');
    form.append('previousPeriodEnd', previousEnd);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const raw = await res.text();
      let data: any;
      try { data = JSON.parse(raw); }
      catch { throw new Error(`Server returned an unexpected response (HTTP ${res.status}).`); }
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return; }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6 mb-6">
      <h3 className="font-display font-semibold mb-3">MSME Company — Financial Statements</h3>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-inksoft uppercase">Company name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
            className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" placeholder="e.g. Acme Industries Pvt Ltd" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-inksoft uppercase">Current period label</label>
            <input value={currentLabel} onChange={(e) => setCurrentLabel(e.target.value)}
              className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" placeholder="e.g. FY26" />
          </div>
          <div>
            <label className="text-xs font-semibold text-inksoft uppercase">Current period end date</label>
            <input type="date" value={currentEnd} onChange={(e) => setCurrentEnd(e.target.value)}
              className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-inksoft uppercase">Previous period label</label>
            <input value={previousLabel} onChange={(e) => setPreviousLabel(e.target.value)}
              className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" placeholder="e.g. FY25" />
          </div>
          <div>
            <label className="text-xs font-semibold text-inksoft uppercase">Previous period end date</label>
            <input type="date" value={previousEnd} onChange={(e) => setPreviousEnd(e.target.value)}
              className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" />
          </div>
        </div>
        <div className="text-xs bg-[#FBF8EF] border border-rule rounded p-3 leading-relaxed">
          <b>Three ways to give the financials</b> (use any one):
          <ol className="list-decimal ml-5 mt-1 space-y-0.5">
            <li><b>Standard template</b> (Excel) — fill it once, works for every client. <a href="/MIS_Standard_Upload_Template.xlsx" download className="text-brassdark underline">Download template</a></li>
            <li><b>Tally trial balance</b> (Excel/CSV, closing balance, all ledgers shown). Add last year&apos;s trial balance below for comparisons.</li>
            <li><b>Signed / provisional financial statements</b> (text PDF with both years). Scanned PDFs cannot be read.</li>
          </ol>
          Debtor/creditor <b>days</b> and item-wise stock cannot come from a trial balance or PDF — upload the ageing / inventory sheets as well for those tabs.
        </div>
        <div>
          <label className="text-xs font-semibold text-inksoft uppercase">
            Current-year file(s) — template, trial balance or PDF (plus optional ageing / inventory sheets)
          </label>
          <input type="file" accept=".xlsx,.xls,.csv,.pdf" multiple onChange={(e) => setFiles(e.target.files)}
            className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF] text-sm" />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-brassdark font-semibold">Trial balance extras (previous year, closing stock)</summary>
          <div className="mt-2 space-y-3">
            <div>
              <label className="text-xs font-semibold text-inksoft uppercase">Previous-year trial balance (optional)</label>
              <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => setPrevFiles(e.target.files)}
                className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF] text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-inksoft uppercase">Closing stock this year (₹)</label>
                <input value={closingStock} onChange={(e) => setClosingStock(e.target.value)} inputMode="numeric"
                  className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" placeholder="only if TB does not include it" />
              </div>
              <div>
                <label className="text-xs font-semibold text-inksoft uppercase">Closing stock last year (₹)</label>
                <input value={prevClosingStock} onChange={(e) => setPrevClosingStock(e.target.value)} inputMode="numeric"
                  className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" />
              </div>
            </div>
          </div>
        </details>
        {error && <p className="text-oxblood text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="bg-brassdark text-white font-semibold px-4 py-2 rounded hover:bg-ink transition disabled:opacity-50">
          {loading ? 'Processing…' : 'Upload & analyse'}
        </button>
        <button type="button" onClick={convert} disabled={converting}
          className="ml-3 border border-brassdark text-brassdark font-semibold px-4 py-2 rounded hover:bg-brassdark hover:text-white transition disabled:opacity-50">
          {converting ? 'Converting…' : 'Convert to template (review in Excel)'}
        </button>
      </form>
      {convertNotes && (
        <div className="mt-3 text-sm bg-amberbg border border-amber rounded p-3">
          <b>Template downloaded.</b> Review the yellow cells and the &quot;Mapping review&quot; sheet, then upload the corrected file.
          {convertNotes.length > 0 && <ul className="list-disc ml-5 mt-1">{convertNotes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}
      {result && (
        <div className="mt-4 text-sm border-t border-rule pt-4">
          {result.warnings?.length > 0 && (
            <div className="mb-3 bg-amberbg border border-amber rounded p-3">
              <b>Please review:</b>
              <ul className="list-disc ml-5 mt-1">{result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          {result.tbSummary && (
            <p className="mb-2 text-inksoft">Trial balance: {result.tbSummary.mapped} ledgers mapped ({result.tbSummary.review} by best guess), {result.tbSummary.debtors} debtors and {result.tbSummary.creditors} creditors found (balances only).</p>
          )}
          <p className="mb-2">
            Matched <b>{result.financialsMatched}/{result.financialsExpected}</b> financial fields.
            {result.receivablesRows > 0 && ` ${result.receivablesRows} receivable ageing rows.`}
            {result.payablesRows > 0 && ` ${result.payablesRows} payable ageing rows.`}
            {result.ledgerBatches?.length > 0 && ` Ledger transactions: ${result.ledgerBatches.map((l: any) => `${l.name} (${l.rows})`).join(', ')}.`}
          </p>
          <button onClick={() => onDone(result.companyId)} className="bg-ink text-paper px-4 py-2 rounded font-semibold hover:bg-brassdark transition">
            View dashboard →
          </button>
        </div>
      )}
    </div>
  );
}

function StartupUploadForm({ onDone }: { onDone: (companyId: string) => void }) {
  const [companyName, setCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError('Choose a fundraising model Excel file'); return; }
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    form.append('companyName', companyName);

    try {
      const res = await fetch('/api/startup-upload', { method: 'POST', body: form });
      const raw = await res.text();
      let data: any;
      try { data = JSON.parse(raw); }
      catch { throw new Error(`Server returned an unexpected response (HTTP ${res.status}).`); }
      if (!res.ok) { setError(data.error ?? 'Upload failed'); return; }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-6 mb-6 border-violet">
      <h3 className="font-display font-semibold mb-1">Startup Company — Fundraising / Operating Model</h3>
      <p className="text-inksoft text-xs mb-3">
        Expects a workbook with sheets named roughly: Assumptions, P&amp;L (with a &quot;Month 1, Month 2…&quot; header row),
        Unit Economics, Cash Flow, Cap Table Sensitivity, and Data Room Checklist. Figures in USD are auto-converted to INR.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-inksoft uppercase">Company name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
            className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" placeholder="e.g. Northstar Labs" />
        </div>
        <div>
          <label className="text-xs font-semibold text-inksoft uppercase">Fundraising Model Excel file</label>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF] text-sm" />
        </div>
        {error && <p className="text-oxblood text-sm">{error}</p>}
        <button type="submit" disabled={loading}
          className="bg-violet text-white font-semibold px-4 py-2 rounded hover:bg-ink transition disabled:opacity-50">
          {loading ? 'Processing…' : 'Upload & analyse'}
        </button>
      </form>
      {result && (
        <div className="mt-4 text-sm border-t border-rule pt-4">
          <p className="mb-2">
            Found <b>{result.monthsFound} months</b> of data, {result.fieldsMatched} fields matched, {result.dataRoomItems} data-room items.
            {result.fieldsMissing?.length > 0 && <> Missing: {result.fieldsMissing.join(', ')}.</>}
          </p>
          <button onClick={() => onDone(result.companyId)} className="bg-ink text-paper px-4 py-2 rounded font-semibold hover:bg-brassdark transition">
            View dashboard →
          </button>
        </div>
      )}
    </div>
  );
}
