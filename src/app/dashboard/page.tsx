'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MsmeUploadForm } from '@/app/components/MsmeUploadForm';

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
      <div className="mb-8 border-b-2 border-ink pb-4 relative">
        <button onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; }}
          className="absolute right-0 top-0 text-xs text-inksoft underline">Log out</button>
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
