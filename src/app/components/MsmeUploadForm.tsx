'use client';
import { useState } from 'react';

export function MsmeUploadForm({ onDone, companyId, onCancel }: { onDone: (companyId: string) => void; companyId?: string; onCancel?: () => void }) {
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
    if (companyId) form.append('companyId', companyId); else form.append('companyName', companyName);
    form.append('currentPeriodLabel', currentLabel);
    form.append('currentPeriodEnd', currentEnd);
    form.append('previousPeriodLabel', previousLabel);
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
      <h3 className="font-display font-semibold mb-3">{companyId ? 'Update data for this company' : 'MSME Company — Financial Statements'}</h3>
      {companyId && <p className="text-xs text-inksoft mb-3">New figures replace this company&apos;s current-year data. Last year&apos;s figures stay unless you also upload a previous-year file. Leave labels and dates blank to keep them.</p>}
      <form onSubmit={submit} className="space-y-3">
        {!companyId && <div>
          <label className="text-xs font-semibold text-inksoft uppercase">Company name</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
            className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" placeholder="e.g. Acme Industries Pvt Ltd" />
        </div>}
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
        {onCancel && <button type="button" onClick={onCancel} className="ml-3 text-sm text-inksoft underline">Cancel</button>}
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
