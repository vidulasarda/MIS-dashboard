'use client';
import { useEffect, useState } from 'react';
import ManagePanel from './ManagePanel';
import LandingOverview from './LandingOverview';
import ForecastTab from './ForecastTab';
import {
  formatINR, pctF, pctChange, fmtByUnit,
  expenseBreakdown, expenseVarianceExplain, FUNDING_SCHEMES, computeFundingGaps,
} from '@/lib/compute';
import {
  trFlag, tpOverallFlag, inventoryFlag, trScenario, tpScenario, inventoryScenario,
  msmeBreachedRows, msmeTaxImpact, inventoryDiscardScenario, IDEAL_RATIOS, ratioVsIdeal,
  TR_BENCHMARK_DAYS, TP_MSME_BENCHMARK_DAYS, INVENTORY_BENCHMARK_DAYS, WcFlag,
} from '@/lib/workingCapitalCompute';

// 7 top-level tabs per the dashboard redesign spec. "Overview" carries its own secondary
// sub-tab row (Overview | Trade Receivables | Trade Payables | Inventory) rendered separately.
const TABS = [
  'Overview',
  'Revenue & Profitability',
  'Expense Intelligence',
  'Financial Ratios',
  'Working Capital',
  'MSME & Funding',
  'Cash Forecast',
  'Ask the CFO Agent',
];
const SLIDE1_SUBTABS = ['Overview', 'Trade Receivables', 'Trade Payables', 'Inventory'];

export default function CompanyPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState(0);
  const [subTab, setSubTab] = useState(0); // landing = Overview (KPIs, summary, WC levers)
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'admin' | 'client' | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => { fetch('/api/auth/me').then((r) => r.json()).then((d) => setRole(d.role ?? null)).catch(() => {}); }, []);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login'; };

  const refetch = () => {
    fetch(`/api/companies/${params.id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Could not load company'));
  };

  useEffect(refetch, [params.id]);

  if (error) return <div className="p-8 text-oxblood">{error}</div>;
  if (!data) return <div className="p-8 text-inksoft">Loading…</div>;
  if (!data.hasFinancials) {
    return (
      <div className="p-8">
        <h1 className="font-display text-2xl mb-2">{data.name}</h1>
        <p className="text-inksoft mb-3">No financials uploaded yet for this company.</p>
        {role === 'admin' && <button onClick={() => setManageOpen(true)} className="bg-ink text-paper px-4 py-2 rounded font-semibold mr-3">Upload data</button>}
        {role === 'admin' && <a href="/dashboard" className="text-brassdark underline">← Back to dashboard</a>}
        {role === 'client' && <button onClick={logout} className="text-brassdark underline">Log out</button>}
        {manageOpen && <ManagePanel companyId={params.id} name={data.name} onChanged={refetch} onClose={() => setManageOpen(false)} />}
      </div>
    );
  }

  const { current: A, previous: P, health, msme, alerts, currentLabel, previousLabel } = data;

  function jumpTo(slide: number, sub?: number) {
    setTab(slide);
    if (sub !== undefined) setSubTab(sub);
  }

  return (
    <div className="flex min-h-screen">
      <nav className="w-56 bg-ink text-paper flex-shrink-0 p-5 sticky top-0 h-screen overflow-y-auto print:hidden">
        {role === 'client'
          ? <button onClick={logout} className="text-xs text-brass hover:underline">Log out</button>
          : <a href="/dashboard" className="text-xs text-brass hover:underline">← Companies</a>}
        <h1 className="font-display font-semibold text-xl mt-2 mb-1">{data.name}</h1>
        <p className="text-[0.68rem] text-brass uppercase tracking-wide mb-4">{currentLabel} vs {previousLabel}</p>
        <button onClick={() => window.print()} className="w-full mb-5 text-xs bg-brass/20 border border-brass text-paper rounded px-3 py-2 hover:bg-brass/30 transition">
          ⬇ Download PDF Report
        </button>
        {role === 'admin' && (
          <button onClick={() => setManageOpen(true)} className="w-full mb-5 -mt-3 text-xs bg-paper/10 border border-paper/40 text-paper rounded px-3 py-2 hover:bg-paper/20 transition">
            ⚙ Manage company
          </button>
        )}
        <ul className="space-y-1">
          {TABS.map((t, i) => (
            <li key={t}>
              <button
                onClick={() => setTab(i)}
                className={`w-full text-left text-sm px-3 py-2 rounded ${tab === i ? 'bg-brass/20 text-paper font-semibold border-l-2 border-brass' : 'text-[#C9C2AC] hover:bg-white/5'}`}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="flex-1 max-w-5xl px-8 py-8 print:max-w-none print:px-4">
        <div className="hidden print:block mb-8 border-b-2 border-ink pb-3">
          <h1 className="font-display font-bold text-2xl">{data.name} — MIS Report</h1>
          <p className="text-inksoft text-sm">{currentLabel} vs {previousLabel}</p>
        </div>

        {tab === 0 && (
          <div>
            <div className="flex gap-2 mb-6 border-b border-rule pb-3 print:hidden">
              {SLIDE1_SUBTABS.map((t, i) => (
                <button key={t} onClick={() => setSubTab(i)}
                  className={`px-3.5 py-1.5 rounded text-sm font-semibold transition ${subTab === i ? 'bg-ink text-paper' : 'bg-card border border-rule text-inksoft hover:border-brass'}`}>
                  {t}
                </button>
              ))}
            </div>
            {subTab === 0 && <LandingOverview data={data} A={A} P={P} onJump={(i: number) => setSubTab(i)} />}
            {subTab === 1 && <TradeReceivablesTab data={data} A={A} P={P} onUploaded={refetch} />}
            {subTab === 2 && <TradePayablesTab data={data} A={A} P={P} onUploaded={refetch} />}
            {subTab === 3 && <InventoryTab data={data} A={A} P={P} onUploaded={refetch} />}
          </div>
        )}
        <TabPanel active={tab === 1}><ProfitabilityTab companyId={params.id} A={A} P={P} currentLabel={currentLabel} previousLabel={previousLabel} /></TabPanel>
        <TabPanel active={tab === 2}><ExpenseTab companyId={params.id} A={A} P={P} currentLabel={currentLabel} previousLabel={previousLabel} /></TabPanel>
        <TabPanel active={tab === 3}><RatiosTab A={A} P={P} currentLabel={currentLabel} previousLabel={previousLabel} /></TabPanel>
        <TabPanel active={tab === 4}><WorkingCapitalTab A={A} P={P} currentLabel={currentLabel} previousLabel={previousLabel} /></TabPanel>
        <TabPanel active={tab === 5}><MsmeFundingTab A={A} health={health} msme={msme} alerts={alerts} /></TabPanel>
        <TabPanel active={tab === 6}><ForecastTab A={A} P={P} /></TabPanel>
        <TabPanel active={tab === 7} noPrint><ChatTab companyId={params.id} /></TabPanel>
      </main>
      {manageOpen && <ManagePanel companyId={params.id} name={data.name} onChanged={refetch} onClose={() => setManageOpen(false)} />}
    </div>
  );
}

function TabPanel({ active, noPrint, children }: { active: boolean; noPrint?: boolean; children: React.ReactNode }) {
  return (
    <div className={`${active ? 'block' : 'hidden'} ${noPrint ? 'print:hidden' : 'print:block'} print:mb-10 print:break-inside-avoid-page`}>
      {children}
    </div>
  );
}

function ChangeBadge({ curr, prev, goodIfUp }: { curr: number; prev: number; goodIfUp: boolean }) {
  const delta = pctChange(curr, prev);
  if (delta === null) return <span className="font-mono text-xs text-inksoft">N/A</span>;
  const up = delta > 0;
  const good = Math.abs(delta) < 0.5 ? null : up === goodIfUp;
  const color = good === null ? 'text-inksoft' : good ? 'text-forest' : 'text-oxblood';
  const arrow = Math.abs(delta) < 0.5 ? '→' : up ? '▲' : '▼';
  return <span className={`font-mono text-xs font-bold ${color}`}>{arrow} {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%</span>;
}

function FlagStamp({ flag }: { flag: WcFlag }) {
  const cls = flag.level === 'good' ? 'good' : flag.level === 'watch' ? 'watch' : 'critical';
  const emoji = flag.level === 'good' ? '🟢' : flag.level === 'watch' ? '🟠' : '🔴';
  return <span className={`stamp ${cls}`}>{emoji} {flag.label}</span>;
}

/* ================= Shared: What-if slider ================= */
function WcSlider({ title, min, max, defaultVal, step = 1, unit, compute, direction }: any) {
  const [val, setVal] = useState(defaultVal);
  const result = compute(val);
  return (
    <div className="card p-5 mb-5 print:hidden">
      <h3 className="font-display font-semibold mb-1">{title}</h3>
      <div className="note mb-4">Cash-timing effect only — this changes when cash arrives, not reported profit, unless it lets you pay down short-term borrowings (shown below when applicable).</div>
      <div className="flex items-center gap-3 mb-4">
        <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => setVal(Number(e.target.value))} className="flex-1" />
        <span className="font-mono font-bold w-24 text-right">{val > 0 ? '+' : ''}{val} {unit}</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#FBF8EF] border border-rule rounded p-3">
          <div className="text-xs uppercase text-inksoft font-semibold mb-1">Cash unlocked</div>
          <div className="font-mono text-lg font-bold">{formatINR(result.cashUnlocked)}</div>
        </div>
        <div className="bg-[#FBF8EF] border border-rule rounded p-3">
          <div className="text-xs uppercase text-inksoft font-semibold mb-1">Finance cost saved</div>
          <div className="font-mono text-lg font-bold">
            {result.financeCostSaved === null ? <span className="text-sm font-normal text-inksoft">No short-term borrowings to offset</span> : formatINR(result.financeCostSaved)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Ageing chart components (React/SVG ports of the approved prototype) ================= */
// "Risk" scheme: older = redder. Correct for Trade Receivables, Inventory, and MSME payables —
// all three genuinely get riskier with age. "Value" scheme: older = greener — for non-MSME
// payables specifically, where longer outstanding means better cash management, the opposite.
const BUCKET_DEFS_RISK = [
  { key: 'b1', label: '0–30d', max: 30, color: '#2E5339' },
  { key: 'b2', label: '31–60d', max: 60, color: '#7A9B6E' },
  { key: 'b3', label: '61–90d', max: 90, color: '#B8721A' },
  { key: 'b4', label: '91–180d', max: 180, color: '#A9451F' },
  { key: 'b5', label: '180d+', max: Infinity, color: '#7A1F2B' },
];
const BUCKET_DEFS_VALUE = [
  { key: 'b1', label: '0–30d', max: 30, color: '#B8721A' },
  { key: 'b2', label: '31–60d', max: 60, color: '#A9C99A' },
  { key: 'b3', label: '61–90d', max: 90, color: '#7A9B6E' },
  { key: 'b4', label: '91–180d', max: 180, color: '#4C7A47' },
  { key: 'b5', label: '180d+', max: Infinity, color: '#2E5339' },
];
function bucketOf(days: number, defs: typeof BUCKET_DEFS_RISK) {
  for (const b of defs) if (days <= b.max) return b.key;
  return 'b5';
}
function AgeingLegend({ scheme }: { scheme: 'risk' | 'value' }) {
  const defs = scheme === 'value' ? BUCKET_DEFS_VALUE : BUCKET_DEFS_RISK;
  const caption = scheme === 'value' ? '(darker green = longer outstanding = better cash management)' : '(darker red = older = higher risk)';
  return (
    <div className="flex gap-4 text-xs text-inksoft mb-2.5 flex-wrap items-center">
      {defs.map((b) => <span key={b.key} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: b.color }} />{b.label}</span>)}
      <span className="italic">{caption}</span>
    </div>
  );
}
/** One horizontal bar per entity, colored by its single ageing bucket. Illustrative: each row's
 *  full balance sits in one bucket since we only have one "days" figure per row, not per-invoice
 *  detail — a real ledger export would allow true splitting across buckets for one customer. */
function StackedAgeingChart({ rows, scheme = 'risk', limit = 10 }: { rows: { name: string; amount: number; days: number }[]; scheme?: 'risk' | 'value'; limit?: number }) {
  const defs = scheme === 'value' ? BUCKET_DEFS_VALUE : BUCKET_DEFS_RISK;
  const top = [...rows].sort((a, b) => b.amount - a.amount).slice(0, limit);
  if (!top.length) return null;
  const maxAmt = Math.max(...top.map((r) => r.amount));
  const barH = 22, gap = 10, labelW = 200, chartW = 420;
  const h = top.length * (barH + gap);
  return (
    <svg viewBox={`0 0 ${labelW + chartW + 90} ${h + 10}`} className="w-full h-auto font-mono" style={{ maxHeight: h + 20 }}>
      {top.map((r, i) => {
        const y = i * (barH + gap);
        const w = (r.amount / maxAmt) * chartW;
        const bucket = defs.find((b) => b.key === bucketOf(r.days, defs))!;
        const label = r.name.length > 26 ? r.name.slice(0, 24) + '…' : r.name;
        return (
          <g key={i}>
            <text x={labelW - 8} y={y + barH * 0.68} fontSize="11" fill="#14213D" textAnchor="end" fontFamily="Inter, sans-serif">{label}</text>
            <rect x={labelW} y={y} width={w} height={barH} fill={bucket.color} rx={2} />
            <text x={labelW + w + 8} y={y + barH * 0.68} fontSize="10.5" fill="#3A4A6B">{formatINR(r.amount, 1)} · {r.days}d</text>
          </g>
        );
      })}
    </svg>
  );
}
function BucketSummaryTable({ rows, total, scheme = 'risk' }: { rows: { amount: number; days: number }[]; total: number; scheme?: 'risk' | 'value' }) {
  const defs = scheme === 'value' ? BUCKET_DEFS_VALUE : BUCKET_DEFS_RISK;
  const sums: Record<string, number> = {}; defs.forEach((b) => (sums[b.key] = 0));
  rows.forEach((r) => { sums[bucketOf(r.days, defs)] += r.amount; });
  return (
    <table className="datatable mb-3">
      <thead><tr><th>Bucket</th><th>Amount</th><th>%</th></tr></thead>
      <tbody>
        {defs.map((b) => (
          <tr key={b.key}><td className="label"><span className="w-2.5 h-2.5 rounded-sm inline-block mr-1.5" style={{ background: b.color }} />{b.label}</td><td>{formatINR(sums[b.key])}</td><td>{total ? ((sums[b.key] / total) * 100).toFixed(1) : '0.0'}%</td></tr>
        ))}
        <tr className="total"><td className="label">Total</td><td>{formatINR(total)}</td><td>100.0%</td></tr>
      </tbody>
    </table>
  );
}
/** Outstanding (x) vs margin % (y), TR-only, only rendered when margin data exists. */
function ProfitabilityScatter({ rows }: { rows: { amount: number; margin: number; days: number }[] }) {
  const w = 620, h = 300, pad = 46;
  const maxAmt = Math.max(...rows.map((r) => r.amount));
  const maxMargin = Math.max(...rows.map((r) => r.margin)) + 5;
  const minMargin = Math.min(0, Math.min(...rows.map((r) => r.margin)) - 2);
  const x = (v: number) => pad + (v / maxAmt) * (w - pad - 30);
  const y = (v: number) => h - pad - ((v - minMargin) / (maxMargin - minMargin)) * (h - pad - 30);
  const gridVals = [0, 1, 2, 3, 4].map((g) => minMargin + ((maxMargin - minMargin) * g) / 4);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
      {gridVals.map((gv, i) => (
        <g key={i}>
          <line x1={pad} y1={y(gv)} x2={w - 20} y2={y(gv)} stroke="#D8D0BC" strokeWidth={1} />
          <text x={6} y={y(gv) + 4} fontSize="9" fill="#3A4A6B" fontFamily="IBM Plex Mono, monospace">{gv.toFixed(0)}%</text>
        </g>
      ))}
      <text x={w / 2} y={h - 8} fontSize="10" fill="#3A4A6B" textAnchor="middle">Outstanding →</text>
      <text x={14} y={14} fontSize="10" fill="#3A4A6B">Margin %</text>
      {rows.map((r, i) => {
        const rad = 4 + (r.amount / maxAmt) * 10;
        const color = r.days > 90 ? '#7A1F2B' : r.days > 60 ? '#B8721A' : '#2E5339';
        return <circle key={i} cx={x(r.amount)} cy={y(r.margin)} r={rad} fill={color} fillOpacity={0.75} stroke="#14213D" strokeWidth={0.5} />;
      })}
    </svg>
  );
}


/* ================= Tab-level ageing upload widget ================= */
function AgeingUploadWidget({ companyId, title, hint, onUploaded }: { companyId: string; title: string; hint: string; onUploaded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setLoading(true); setError(null); setResult(null);
    const form = new FormData();
    form.append('files', file);
    form.append('companyId', companyId);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const raw = await res.text();
      let d: any;
      try { d = JSON.parse(raw); } catch { throw new Error(`Unexpected response (HTTP ${res.status})`); }
      if (!res.ok) { setError(d.error ?? 'Upload failed'); return; }
      setResult(d);
      setFile(null);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-4 mb-5 border-dashed">
      <h3 className="font-display font-semibold text-sm mb-1">{title}</h3>
      <p className="text-xs text-inksoft mb-3">{hint}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); setError(null); }}
          className="text-sm border border-rule rounded px-2 py-1.5 bg-[#FBF8EF] flex-1 min-w-[200px]" />
        <button onClick={submit} disabled={!file || loading}
          className="bg-brassdark text-white text-sm font-semibold px-4 py-1.5 rounded hover:bg-ink transition disabled:opacity-40">
          {loading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="text-oxblood text-xs mt-2 font-mono">{error}</p>}
      {result && (
        <div className="text-xs text-inksoft mt-2">
          Detected: <b>{result.receivablesRows ?? 0}</b> receivable rows, <b>{result.payablesRows ?? 0}</b> payable rows, <b>{result.inventoryRows ?? 0}</b> inventory rows.
          {result.receivablesRows === 0 && result.payablesRows === 0 && result.inventoryRows === 0 && (
            <span className="text-oxblood block mt-1">Nothing was detected in this file — check that it has a header row with recognizable column names (see hint above), and that the sheet name or a column header hints at what it is (e.g. contains &quot;customer&quot;, &quot;vendor&quot;, &quot;item&quot;, &quot;ageing&quot;).</span>
          )}
        </div>
      )}
    </div>
  );
}

function TradeReceivablesTab({ data, A, P, onUploaded }: any) {
  const { disclosedReceivablesAgeing } = data;
  const flag = trFlag(A.debtorDays);
  const total = disclosedReceivablesAgeing?.reduce((s: number, r: any) => s + r.amount, 0) ?? 0;
  return (
    <div>
      <h1 className="sectitle"><span>Trade Receivables</span><span className="rule"></span></h1>

      <AgeingUploadWidget companyId={data.id} onUploaded={onUploaded}
        title="Upload receivables ageing"
        hint='Columns: Customer, Outstanding Amount, Days Overdue — optionally "Margin %" for the profitability view. Column names just need to contain these words somewhere (case-insensitive).' />

      <div className="flex gap-4 items-start mb-5 flex-wrap">
        <div className="card p-4 flex-1 min-w-[220px]">
          <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">Total Receivables</div>
          <div className="font-mono text-xl font-semibold border-b-2 border-ink inline-block pb-0.5">{formatINR(A.receivables)}</div>
          <div className="text-xs text-inksoft font-mono mt-1.5">Previous: {formatINR(P.receivables)}</div>
          <div className="mt-1"><ChangeBadge curr={A.receivables} prev={P.receivables} goodIfUp={false} /></div>
        </div>
        <div className="card p-4 flex-1 min-w-[220px]">
          <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">Debtor Days</div>
          <div className="font-mono text-xl font-semibold">{A.debtorDays.toFixed(0)} days</div>
          <div className="text-xs text-inksoft mt-1.5">Benchmark: {TR_BENCHMARK_DAYS} days</div>
          <div className="mt-1"><FlagStamp flag={flag} /></div>
        </div>
      </div>

      <WcSlider title="What if we collected faster?" min={0} max={60} defaultVal={15} unit="days" direction={-1}
        compute={(v: number) => trScenario(v, A)} />

      {!disclosedReceivablesAgeing && (
        <div className="note">No receivables ageing uploaded. Upload a receivables ageing file (Customer, Outstanding Amount, Days Overdue — optionally a &quot;Margin %&quot; column for profitability, and an &quot;MSME&quot; column on the payables side) to populate ageing, top customers, and overdue detail here.</div>
      )}
      {disclosedReceivablesAgeing && (
        <>
          <h2 className="font-display font-semibold mb-2 mt-6">Receivables Ageing — by Customer</h2>
          <AgeingLegend scheme="risk" />
          <StackedAgeingChart rows={disclosedReceivablesAgeing} scheme="risk" limit={12} />
          <h2 className="font-display font-semibold mb-2 mt-6">Ageing Bucket Summary</h2>
          <BucketSummaryTable rows={disclosedReceivablesAgeing} total={total} scheme="risk" />
          <CustomerAgeingTable rows={disclosedReceivablesAgeing} label="Customer" />
          <ProfitabilitySection rows={disclosedReceivablesAgeing} />
        </>
      )}
    </div>
  );
}

function ProfitabilitySection({ rows }: { rows: any[] }) {
  const hasMargin = rows.some((r) => typeof r.marginPct === 'number');
  if (!hasMargin) {
    return <div className="note mt-4">Customer-wise profitability isn&apos;t shown — standard ageing files don&apos;t include per-customer margin data. Add a &quot;Margin %&quot; column to the upload (per-customer gross margin, from your sales/costing records) to enable this view.</div>;
  }
  const withMargin = rows.filter((r) => typeof r.marginPct === 'number');
  const ranked = [...withMargin].sort((a, b) => (b.amount * b.marginPct) - (a.amount * a.marginPct)).slice(0, 15);
  return (
    <div className="mt-6">
      <h2 className="font-display font-semibold mb-2">Customer-wise Profitability</h2>
      <div className="note">Bubble size = outstanding amount; color = ageing risk (green ≤60d, amber 61–90d, red &gt;90d).</div>
      <ProfitabilityScatter rows={withMargin.map((r) => ({ amount: r.amount, margin: r.marginPct, days: r.days }))} />
      <table className="datatable mt-3">
        <thead><tr><th>Customer</th><th>Outstanding</th><th>Margin %</th><th>Est. Profit Locked in Receivables</th></tr></thead>
        <tbody>{ranked.map((r, i) => (
          <tr key={i}><td className="label">{r.name}</td><td>{formatINR(r.amount)}</td><td>{r.marginPct.toFixed(1)}%</td><td>{formatINR(r.amount * r.marginPct / 100)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ================= SLIDE 1c: Trade Payables ================= */
function MsmeTaxImpactCard({ msmeRows }: { msmeRows: any[] }) {
  const [taxRate, setTaxRate] = useState(25);
  const breached = msmeBreachedRows(msmeRows);
  const breachedAmount = breached.reduce((s, r) => s + r.amount, 0);
  const impact = msmeTaxImpact(breachedAmount, taxRate);
  return (
    <div className="card p-5 mb-5">
      <h3 className="font-display font-semibold mb-1">MSME payment breach — income tax impact</h3>
      <div className="note mb-3">Not a cash-timing slider — MSME dues can&apos;t legally be pushed beyond 45 days, so there&apos;s no &quot;what if we extended it&quot; scenario to explore. What&apos;s actually at stake: under <b>Section 43B(h) of the Income Tax Act</b>, any amount owed to an MSME supplier not paid within the 45-day limit is <b>disallowed as a business expense</b> for this year&apos;s tax computation — deductible only in the year it&apos;s actually paid.</div>
      {breached.length ? (
        <>
          <table className="datatable mb-3">
            <thead><tr><th>Supplier</th><th>Outstanding</th><th>Days</th></tr></thead>
            <tbody>
              {breached.map((s, i) => <tr key={i}><td className="label">{s.name}</td><td>{formatINR(s.amount)}</td><td>{s.days}d</td></tr>)}
              <tr className="total"><td className="label">Total currently in breach</td><td>{formatINR(breachedAmount)}</td><td></td></tr>
            </tbody>
          </table>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-inksoft whitespace-nowrap">Income tax rate</span>
            <input type="range" min={15} max={35} step={1} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="flex-1" />
            <span className="font-mono font-bold w-12 text-right">{taxRate}%</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#FBF8EF] border border-rule rounded p-3"><div className="text-xs uppercase text-inksoft font-semibold mb-1">Expense Disallowed</div><div className="font-mono text-lg font-bold">{formatINR(breachedAmount)}</div></div>
            <div className="bg-[#FBF8EF] border border-rule rounded p-3"><div className="text-xs uppercase text-inksoft font-semibold mb-1">Additional Tax Liability</div><div className="font-mono text-lg font-bold">{formatINR(impact)}</div></div>
          </div>
          <div className="note mt-3 mb-0">This is a timing cost, not a permanent one — the deduction is recovered in whichever year the supplier is actually paid. But this year&apos;s tax bill is higher than it needs to be, purely from payment timing.</div>
        </>
      ) : (
        <div className="note mb-0">No MSME suppliers currently beyond 45 days — no disallowance exposure right now.</div>
      )}
    </div>
  );
}

function TradePayablesTab({ data, A, P, onUploaded }: any) {
  const { disclosedPayablesMsmeAgeing, disclosedPayablesOtherAgeing } = data;
  const msmeTotal = disclosedPayablesMsmeAgeing?.reduce((s: number, r: any) => s + r.amount, 0) ?? null;
  const otherTotal = disclosedPayablesOtherAgeing?.reduce((s: number, r: any) => s + r.amount, 0) ?? null;
  const tp = tpOverallFlag(A.creditorDays, msmeTotal, otherTotal, A.purchases);
  // All payable rows regardless of MSME tagging — used for the charts, which don't need the split.
  const allPayablesRows = [...(disclosedPayablesMsmeAgeing ?? []), ...(disclosedPayablesOtherAgeing ?? [])];
  const allPayablesTotal = allPayablesRows.reduce((s: number, r: any) => s + r.amount, 0);

  return (
    <div>
      <h1 className="sectitle"><span>Trade Payables</span><span className="rule"></span></h1>

      <AgeingUploadWidget companyId={data.id} onUploaded={onUploaded}
        title="Upload payables ageing"
        hint='Columns: Vendor, Outstanding Amount, Days — optionally an "MSME" column (Y/N) to enable the compliance-specific split. Column names just need to contain these words somewhere (case-insensitive).' />

      <div className="flex gap-4 items-start mb-5 flex-wrap">
        <div className="card p-4 flex-1 min-w-[220px]">
          <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">Total Payables</div>
          <div className="font-mono text-xl font-semibold border-b-2 border-ink inline-block pb-0.5">{formatINR(A.tradePayables)}</div>
          <div className="text-xs text-inksoft font-mono mt-1.5">Previous: {formatINR(P.tradePayables)}</div>
          <div className="mt-1"><ChangeBadge curr={A.tradePayables} prev={P.tradePayables} goodIfUp={true} /></div>
        </div>
        <div className="card p-4 flex-1 min-w-[220px]">
          <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">Creditor Days (overall)</div>
          <div className="font-mono text-xl font-semibold">{A.creditorDays.toFixed(0)} days</div>
          <div className="mt-1"><FlagStamp flag={tp.overall} /></div>
        </div>
      </div>

      {/* MSME-specific compliance sections — these genuinely require knowing which suppliers
          are MSME, so they stay gated on the split existing. */}
      {tp.hasSplit ? (
        <>
          <div className="note mb-4">MSME and non-MSME suppliers are judged in <b>opposite directions</b>: MSME dues are governed by a hard 45-day statutory deadline (no &quot;extend the days&quot; lever exists — the law doesn&apos;t allow it); non-MSME trade credit is ordinary working-capital optimization with no legal ceiling, where longer is genuinely better.</div>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">To MSME suppliers</div>
              <div className="font-mono text-lg font-semibold">{tp.msme?.days.toFixed(0)} days</div>
              <div className="text-xs text-inksoft mt-1">Statutory limit: {TP_MSME_BENCHMARK_DAYS} days</div>
              <div className="mt-1">{tp.msme && <FlagStamp flag={tp.msme} />}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">To non-MSME suppliers</div>
              <div className="font-mono text-lg font-semibold">{tp.nonMsme?.days.toFixed(0)} days</div>
              <div className="text-xs text-inksoft mt-1">Longer is better — no ceiling</div>
              <div className="mt-1">{tp.nonMsme && <FlagStamp flag={tp.nonMsme} />}</div>
            </div>
          </div>

          <MsmeTaxImpactCard msmeRows={disclosedPayablesMsmeAgeing ?? []} />

          <WcSlider title="What if we extended non-MSME payment terms?" min={0} max={30} defaultVal={10} unit="days"
            compute={(v: number) => tpScenario(v, A)} />
        </>
      ) : (
        <>
          <div className="note mb-4">No MSME/non-MSME split disclosed in the upload — treated entirely as non-MSME (no compliance ceiling assumed without evidence). Add an &quot;MSME&quot; column (Y/N) to the payables ageing upload to unlock the split day-counts and the Section 43B(h) tax exposure calculation.</div>
          <WcSlider title="What if we changed payment terms?" min={-30} max={30} defaultVal={10} unit="days"
            compute={(v: number) => tpScenario(v, A)} />
        </>
      )}

      {/* Ageing charts render whenever ageing data exists — they do NOT depend on knowing MSME
          status. Previously these were nested inside the hasSplit branch, which meant a company
          without an MSME column saw no charts at all despite having perfectly good bucket data. */}
      {tp.hasSplit ? (
        <>
          <h2 className="font-display font-semibold mb-2 mt-6">Payables Ageing — MSME Creditors</h2>
          <div className="note">Risk-coded (red = older = closer to or past the 45-day compliance line) — ageing here is a genuine risk signal.</div>
          <AgeingLegend scheme="risk" />
          <StackedAgeingChart rows={disclosedPayablesMsmeAgeing ?? []} scheme="risk" />
          <BucketSummaryTable rows={disclosedPayablesMsmeAgeing ?? []} total={msmeTotal ?? 0} scheme="risk" />

          <h2 className="font-display font-semibold mb-2 mt-6">Payables Ageing — Non-MSME Creditors</h2>
          <div className="note">Value-coded (green = older = longer trade credit = better cash management) — the opposite of the MSME chart above, deliberately, since the direction of &quot;good&quot; is reversed here.</div>
          <AgeingLegend scheme="value" />
          <StackedAgeingChart rows={disclosedPayablesOtherAgeing ?? []} scheme="value" />
          <BucketSummaryTable rows={disclosedPayablesOtherAgeing ?? []} total={otherTotal ?? 0} scheme="value" />
        </>
      ) : allPayablesRows.length > 0 ? (
        <>
          <h2 className="font-display font-semibold mb-2 mt-6">Payables Ageing — by Vendor</h2>
          <div className="note">Value-coded (green = older = longer trade credit = better cash management), since with no MSME flag supplied these are treated as ordinary trade credit with no statutory ceiling.</div>
          <AgeingLegend scheme="value" />
          <StackedAgeingChart rows={allPayablesRows} scheme="value" limit={12} />
          <BucketSummaryTable rows={allPayablesRows} total={allPayablesTotal} scheme="value" />
        </>
      ) : null}

      {disclosedPayablesMsmeAgeing && (<><h2 className="font-display font-semibold mb-2 mt-6">MSME Creditors — Top Vendors</h2><CustomerAgeingTable rows={disclosedPayablesMsmeAgeing} label="Vendor" /></>)}
      {disclosedPayablesOtherAgeing && (<><h2 className="font-display font-semibold mb-2 mt-6">{tp.hasSplit ? 'Non-MSME' : ''} Creditors — Top Vendors</h2><CustomerAgeingTable rows={disclosedPayablesOtherAgeing} label="Vendor" /></>)}
      {!disclosedPayablesMsmeAgeing && !disclosedPayablesOtherAgeing && (
        <div className="note">No payables ageing uploaded. Upload a payables ageing file (Vendor, Outstanding Amount, Days Overdue, optionally an &quot;MSME&quot; column) to populate this.</div>
      )}
    </div>
  );
}

/* ================= SLIDE 1d: Inventory ================= */
function InventoryDiscardCard({ inventoryRows, grossMargin }: { inventoryRows: any[]; grossMargin: number }) {
  const [recoveryRate, setRecoveryRate] = useState(30);
  const slowMoving = inventoryRows.filter((i) => i.days > 90).sort((a, b) => b.days - a.days);
  const slowMovingValue = slowMoving.reduce((s, r) => s + r.amount, 0);
  const fastestItem = [...inventoryRows].sort((a, b) => a.days - b.days)[0];
  if (!inventoryRows.length || !fastestItem) return null;
  const result = inventoryDiscardScenario(slowMovingValue, recoveryRate, fastestItem.days, grossMargin);
  return (
    <div className="card p-5 mb-5">
      <h3 className="font-display font-semibold mb-1">What if we discarded slow-moving stock and reinvested in {fastestItem.name}?</h3>
      <div className="note mb-3">
        Two assumptions drive this, both adjustable: the recovery rate on liquidating the {formatINR(slowMovingValue)} of stock sitting &gt;90 days
        {slowMoving.length ? ` (${slowMoving.map((i) => i.name).join(', ')})` : ''}, and reinvesting whatever cash that frees into more of the
        fastest-turning item on hand ({fastestItem.name}, {fastestItem.days} days on hand) — using the company&apos;s overall gross margin
        ({grossMargin.toFixed(1)}%) as a stand-in for that item&apos;s margin specifically, since item-level margins aren&apos;t available.
      </div>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-inksoft whitespace-nowrap w-40">Liquidation recovery rate</span>
        <input type="range" min={0} max={100} step={5} value={recoveryRate} onChange={(e) => setRecoveryRate(Number(e.target.value))} className="flex-1" />
        <span className="font-mono font-bold w-12 text-right">{recoveryRate}%</span>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="bg-[#FBF8EF] border border-rule rounded p-3"><div className="text-xs uppercase text-inksoft font-semibold mb-1">Cash Recovered</div><div className="font-mono text-lg font-bold">{formatINR(result.cashRecovered)}</div></div>
        <div className="bg-[#FBF8EF] border border-rule rounded p-3"><div className="text-xs uppercase text-inksoft font-semibold mb-1">One-Time Write-Off (P&amp;L)</div><div className="font-mono text-lg font-bold">{formatINR(result.writeOff)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-[#FBF8EF] border border-rule rounded p-3"><div className="text-xs uppercase text-inksoft font-semibold mb-1">Incremental Annual Revenue</div><div className="font-mono text-lg font-bold">{formatINR(result.incrementalRevenue)}</div></div>
        <div className="bg-[#FBF8EF] border border-rule rounded p-3"><div className="text-xs uppercase text-inksoft font-semibold mb-1">Incremental Annual Gross Profit</div><div className="font-mono text-lg font-bold">{formatINR(result.incrementalGrossProfit)}</div></div>
      </div>
      <div className="note mt-3 mb-0">This assumes enough customer demand exists to absorb the extra turnover — it shows what&apos;s financially possible if you could sell that much more, not a guarantee anyone will buy it. That&apos;s a business judgment call this model can&apos;t make for you.</div>
    </div>
  );
}

function InventoryTab({ data, A, P, onUploaded }: any) {
  const { disclosedInventoryAgeing } = data;
  const flag = inventoryFlag(A.inventoryDays);
  const total = disclosedInventoryAgeing?.reduce((s: number, r: any) => s + r.amount, 0) ?? 0;
  const slowMoving = disclosedInventoryAgeing?.filter((i: any) => i.days > 90).sort((a: any, b: any) => b.days - a.days) ?? [];
  return (
    <div>
      <h1 className="sectitle"><span>Inventory</span><span className="rule"></span></h1>

      <AgeingUploadWidget companyId={data.id} onUploaded={onUploaded}
        title="Upload inventory ageing"
        hint='Columns: Item/Category, Value, Days on Hand. Column names just need to contain these words somewhere (case-insensitive).' />

      <div className="flex gap-4 items-start mb-5 flex-wrap">
        <div className="card p-4 flex-1 min-w-[220px]">
          <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">Total Inventory Value</div>
          <div className="font-mono text-xl font-semibold border-b-2 border-ink inline-block pb-0.5">{formatINR(A.inventories)}</div>
          <div className="text-xs text-inksoft font-mono mt-1.5">Previous: {formatINR(P.inventories)}</div>
          <div className="mt-1"><ChangeBadge curr={A.inventories} prev={P.inventories} goodIfUp={false} /></div>
        </div>
        <div className="card p-4 flex-1 min-w-[220px]">
          <div className="text-xs uppercase tracking-wide text-inksoft font-semibold mb-1.5">Inventory Days</div>
          <div className="font-mono text-xl font-semibold">{A.inventoryDays.toFixed(0)} days</div>
          <div className="text-xs text-inksoft mt-1.5">Benchmark: {INVENTORY_BENCHMARK_DAYS} days (2 months)</div>
          <div className="mt-1"><FlagStamp flag={flag} /></div>
        </div>
      </div>
      <WcSlider title="What if we reduced stock-on-hand?" min={0} max={90} defaultVal={20} unit="days"
        compute={(v: number) => inventoryScenario(v, A)} />

      {disclosedInventoryAgeing ? (
        <>
          <InventoryDiscardCard inventoryRows={disclosedInventoryAgeing} grossMargin={A.grossMargin} />
          <h2 className="font-display font-semibold mb-2 mt-6">Inventory Ageing — by Item / Category</h2>
          <AgeingLegend scheme="risk" />
          <StackedAgeingChart rows={disclosedInventoryAgeing} scheme="risk" />
          <BucketSummaryTable rows={disclosedInventoryAgeing} total={total} scheme="risk" />
          {slowMoving.length > 0 && (
            <>
              <h2 className="font-display font-semibold mb-2 mt-6">Slow-Moving / At-Risk Stock (&gt;90 days on hand)</h2>
              <table className="datatable">
                <thead><tr><th>Item / Category</th><th>Value</th><th>Days on Hand</th><th>Risk</th></tr></thead>
                <tbody>{slowMoving.map((i: any, idx: number) => (
                  <tr key={idx}><td className="label">{i.name}</td><td>{formatINR(i.amount)}</td><td>{i.days}d</td>
                    <td><span className={`stamp ${i.days > 180 ? 'critical' : 'watch'}`}>{i.days > 180 ? 'Obsolescence risk' : 'Slow-moving'}</span></td></tr>
                ))}</tbody>
              </table>
            </>
          )}
          <CustomerAgeingTable rows={disclosedInventoryAgeing} label="Item" />
        </>
      ) : (
        <div className="note">No item-wise inventory ageing uploaded. Upload a file with Item/Category, Value, and Days on Hand columns to populate ageing detail and the slow-moving-stock discard scenario here.</div>
      )}
    </div>
  );
}

function CustomerAgeingTable({ rows, label }: { rows: { name: string; amount: number; days: number }[]; label: string }) {
  const buckets = { 'Not due': 0, '0-30': 0, '31-60': 0, '61-90': 0, '91-180': 0, '180+': 0 } as Record<string, number>;
  for (const r of rows) {
    const b = r.days <= 0 ? 'Not due' : r.days <= 30 ? '0-30' : r.days <= 60 ? '31-60' : r.days <= 90 ? '61-90' : r.days <= 180 ? '91-180' : '180+';
    buckets[b] += r.amount;
  }
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const top10 = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 10);
  return (
    <>
      <table className="datatable mb-3">
        <thead><tr><th>Bucket</th><th>Amount</th><th>%</th></tr></thead>
        <tbody>
          {Object.entries(buckets).map(([b, v]) => (<tr key={b}><td className="label">{b}</td><td>{formatINR(v)}</td><td>{total ? ((v / total) * 100).toFixed(1) : '0.0'}%</td></tr>))}
          <tr className="total"><td className="label">Total</td><td>{formatINR(total)}</td><td>100.0%</td></tr>
        </tbody>
      </table>
      <table className="datatable">
        <thead><tr><th>Top {label}s</th><th>Amount</th><th>Days</th></tr></thead>
        <tbody>{top10.map((r, i) => <tr key={i}><td className="label">{r.name}</td><td>{formatINR(r.amount)}</td><td>{r.days} days</td></tr>)}</tbody>
      </table>
    </>
  );
}

/* ================= Revenue & Profitability (KPIs + full AI summary relocated here) ================= */
function KpiCard({ label, curr, prev, fmt, goodIfUp }: any) {
  return (
    <div className="card p-4">
      <div className="flex justify-between items-start mb-1.5">
        <div className="text-xs uppercase tracking-wide text-inksoft font-semibold">{label}</div>
        <ChangeBadge curr={curr} prev={prev} goodIfUp={goodIfUp} />
      </div>
      <div className="font-mono text-xl font-semibold border-b-2 border-ink inline-block pb-0.5">{fmt(curr)}</div>
      <div className="text-xs text-inksoft font-mono mt-1.5">Previous: {fmt(prev)}</div>
    </div>
  );
}

function Bar({ label, curr, prev, max, fmt }: any) {
  const h = (v: number) => Math.max(4, (Math.abs(v) / max) * 110);
  return (
    <div className="flex flex-col items-center gap-1.5 flex-1">
      <div className="flex items-end gap-1 h-[120px]">
        <div className="w-6 bg-rule rounded-t-sm relative" style={{ height: h(prev) }}><span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[0.6rem] font-mono whitespace-nowrap">{fmt(prev)}</span></div>
        <div className="w-6 bg-brass rounded-t-sm relative" style={{ height: h(curr) }}><span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[0.6rem] font-mono whitespace-nowrap">{fmt(curr)}</span></div>
      </div>
      <div className="text-xs font-mono text-inksoft text-center">{label}</div>
    </div>
  );
}

function ProfitabilityTab({ companyId, A, P, currentLabel, previousLabel }: any) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function generate() {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/insights`, { method: 'POST' });
      const raw = await res.text();
      let d: any;
      try { d = JSON.parse(raw); } catch { throw new Error(`Unexpected response (HTTP ${res.status})`); }
      if (!res.ok) { setErr(d.error); return; }
      setSummary(d.summary);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Failed to generate summary'); }
    finally { setLoading(false); }
  }

  const max = Math.max(A.revenue, P.revenue, 1);
  const maxP = Math.max(Math.abs(A.grossProfit), Math.abs(P.grossProfit), Math.abs(A.ebitda), Math.abs(P.ebitda), Math.abs(A.pat), Math.abs(P.pat), 1);
  return (
    <div>
      <h1 className="sectitle"><span>Revenue &amp; Profitability</span><span className="rule"></span></h1>

      <div className="card p-5 mb-5 print:break-inside-avoid">
        <h3 className="font-display font-semibold mb-2">Full Management Summary</h3>
        {!summary && !loading && <p className="text-inksoft text-sm mb-3 print:hidden">Generate the full CFO-style write-up for this period.</p>}
        {loading && <p className="text-inksoft text-sm italic mb-3">Analysing…</p>}
        {err && <p className="text-oxblood text-sm mb-3 font-mono">{err}</p>}
        {summary && <div className="text-sm leading-relaxed mb-3 whitespace-pre-wrap">{summary.split('\n').filter(Boolean).map((l, i) => <p key={i} className="mb-2">{l}</p>)}</div>}
        <button onClick={generate} disabled={loading} className="bg-ink text-paper text-sm font-semibold px-4 py-2 rounded hover:bg-brassdark transition disabled:opacity-50 print:hidden">
          {summary ? 'Regenerate' : 'Generate full summary'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <KpiCard label="Revenue" curr={A.revenue} prev={P.revenue} fmt={formatINR} goodIfUp={true} />
        <KpiCard label="EBITDA Margin" curr={A.ebitdaMargin} prev={P.ebitdaMargin} fmt={(v: number) => v.toFixed(2) + '%'} goodIfUp={true} />
        <KpiCard label="Net Profit" curr={A.pat} prev={P.pat} fmt={formatINR} goodIfUp={true} />
        <KpiCard label="Cash Balance" curr={A.cash} prev={P.cash} fmt={formatINR} goodIfUp={true} />
      </div>

      <h2 className="font-display font-semibold mb-2">Revenue</h2>
      <div className="flex gap-4 text-xs text-inksoft mb-1"><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rule rounded-sm inline-block" />{previousLabel}</span><span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 bg-brass rounded-sm inline-block" />{currentLabel}</span></div>
      <div className="flex gap-6 mb-6 mt-4"><Bar label="Revenue" curr={A.revenue} prev={P.revenue} max={max} fmt={(v: number) => formatINR(v, 1)} /></div>
      <table className="datatable mb-6">
        <thead><tr><th></th><th>{currentLabel}</th><th>{previousLabel}</th><th>Change</th></tr></thead>
        <tbody>
          <tr><td className="label">Revenue</td><td>{formatINR(A.revenue)}</td><td>{formatINR(P.revenue)}</td><td><ChangeBadge curr={A.revenue} prev={P.revenue} goodIfUp={true} /></td></tr>
          <tr><td className="label">Other Income</td><td>{formatINR(A.otherIncome)}</td><td>{formatINR(P.otherIncome)}</td><td><ChangeBadge curr={A.otherIncome} prev={P.otherIncome} goodIfUp={true} /></td></tr>
          <tr className="total"><td className="label">Total Income</td><td>{formatINR(A.totalIncome)}</td><td>{formatINR(P.totalIncome)}</td><td><ChangeBadge curr={A.totalIncome} prev={P.totalIncome} goodIfUp={true} /></td></tr>
        </tbody>
      </table>
      <h2 className="font-display font-semibold mb-2">Profitability Waterfall</h2>
      <div className="flex gap-6 mb-6 mt-4">
        <Bar label="Gross Profit" curr={A.grossProfit} prev={P.grossProfit} max={maxP} fmt={(v: number) => formatINR(v, 1)} />
        <Bar label="EBITDA" curr={A.ebitda} prev={P.ebitda} max={maxP} fmt={(v: number) => formatINR(v, 1)} />
        <Bar label="Net Profit" curr={A.pat} prev={P.pat} max={maxP} fmt={(v: number) => formatINR(v, 1)} />
      </div>
      <table className="datatable mb-4">
        <thead><tr><th></th><th>{currentLabel}</th><th>{previousLabel}</th><th>Margin {currentLabel}</th><th>Margin {previousLabel}</th></tr></thead>
        <tbody>
          <tr><td className="label">Gross Profit</td><td>{formatINR(A.grossProfit)}</td><td>{formatINR(P.grossProfit)}</td><td>{A.grossMargin.toFixed(2)}%</td><td>{P.grossMargin.toFixed(2)}%</td></tr>
          <tr><td className="label">EBITDA</td><td>{formatINR(A.ebitda)}</td><td>{formatINR(P.ebitda)}</td><td>{A.ebitdaMargin.toFixed(2)}%</td><td>{P.ebitdaMargin.toFixed(2)}%</td></tr>
          <tr><td className="label">EBIT</td><td>{formatINR(A.ebit)}</td><td>{formatINR(P.ebit)}</td><td>{A.ebitMargin.toFixed(2)}%</td><td>{P.ebitMargin.toFixed(2)}%</td></tr>
          <tr><td className="label">Profit Before Tax</td><td>{formatINR(A.pbt)}</td><td>{formatINR(P.pbt)}</td><td>{A.revenue ? (A.pbt / A.revenue * 100).toFixed(2) : '0.00'}%</td><td>{P.revenue ? (P.pbt / P.revenue * 100).toFixed(2) : '0.00'}%</td></tr>
          <tr className="total"><td className="label">Net Profit (PAT)</td><td>{formatINR(A.pat)}</td><td>{formatINR(P.pat)}</td><td>{A.netMargin.toFixed(2)}%</td><td>{P.netMargin.toFixed(2)}%</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================= Expense Intelligence (unchanged) ================= */
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  let cumulative = 0;
  const R = 60, C = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 160 160" className="w-40 h-40 flex-shrink-0">
      <g transform="rotate(-90 80 80)">
        {segments.map((s, i) => {
          const val = Math.max(0, s.value);
          const frac = val / total;
          const dash = frac * C;
          const offset = -cumulative * C;
          cumulative += frac;
          return <circle key={i} cx="80" cy="80" r={R} fill="none" stroke={s.color} strokeWidth="26" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={offset} />;
        })}
      </g>
      <circle cx="80" cy="80" r="34" fill="#FFFDF8" />
    </svg>
  );
}
const EXPENSE_COLORS = ['#A97C3F', '#7A1F2B', '#2E5339', '#B8721A', '#3A4A6B', '#8A6530'];
function ExpenseTab({ companyId, A, P, currentLabel, previousLabel }: any) {
  const lines = expenseBreakdown(A, P);
  const totalCurrent = lines.reduce((s, l) => s + Math.abs(l.current), 0);
  const segments = lines.map((l, i) => ({ label: l.label, value: Math.abs(l.current), color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }));
  return (
    <div>
      <h1 className="sectitle"><span>Expense Intelligence</span><span className="rule"></span></h1>
      <div className="flex gap-6 items-center flex-wrap mb-6 print:break-inside-avoid">
        <DonutChart segments={segments} />
        <div className="flex-1 min-w-[220px] space-y-1.5">
          {lines.map((l, i) => (
            <div key={l.label} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }} />
              <span className="flex-1 text-inksoft">{l.label}</span>
              <span className="font-mono">{totalCurrent ? ((Math.abs(l.current) / totalCurrent) * 100).toFixed(1) : '0.0'}%</span>
            </div>
          ))}
        </div>
      </div>
      <table className="datatable mb-4">
        <thead><tr><th></th><th>{currentLabel}</th><th>% of Revenue</th><th>% of Total Exp.</th><th>{previousLabel}</th><th>Change</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label}>
              <td className="label">{l.label}</td><td>{formatINR(l.current)}</td>
              <td>{A.revenue ? ((l.current / A.revenue) * 100).toFixed(1) : '0.0'}%</td>
              <td>{totalCurrent ? ((Math.abs(l.current) / totalCurrent) * 100).toFixed(1) : '0.0'}%</td>
              <td>{formatINR(l.previous)}</td><td><ChangeBadge curr={l.current} prev={l.previous} goodIfUp={false} /></td>
            </tr>
          ))}
          <tr className="total"><td className="label">Total Expenses</td><td>{formatINR(A.totalExpenses)}</td><td>{A.revenue ? (A.totalExpenses / A.revenue * 100).toFixed(1) : '0.0'}%</td><td>100.0%</td><td>{formatINR(P.totalExpenses)}</td><td><ChangeBadge curr={A.totalExpenses} prev={P.totalExpenses} goodIfUp={false} /></td></tr>
        </tbody>
      </table>
      <ExpenseSplitSection companyId={companyId} A={A} P={P} currentLabel={currentLabel} previousLabel={previousLabel} />
      <h2 className="font-display font-semibold mb-2 mt-6">Lines with &gt;50% Variance</h2>
      {lines.filter((l) => { const g = pctChange(l.current, l.previous); return g !== null && Math.abs(g) > 50; }).map((l) => (
        <div key={l.label} className="note mb-2"><b>{l.label}:</b> {expenseVarianceExplain(l, A, P)}</div>
      ))}
      {lines.filter((l) => { const g = pctChange(l.current, l.previous); return g !== null && Math.abs(g) > 50; }).length === 0 && (
        <div className="note">No expense line moved more than 50% period-on-period.</div>
      )}
    </div>
  );
}


/* ================= Expense split (detail behind the P&L heads) ================= */
function ExpenseSplitSection({ companyId, A, P, currentLabel, previousLabel }: any) {
  const [rows, setRows] = useState<{ head: string; current: number; previous: number }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function load() {
    try { const r = await fetch(`/api/companies/${companyId}/expense-split`); if (r.ok) setRows((await r.json()).rows ?? []); } catch {}
  }
  useEffect(() => { load(); }, [companyId]);

  async function upload() {
    if (!file) return;
    setBusy(true); setMsg(null);
    const form = new FormData(); form.append('file', file);
    try {
      const r = await fetch(`/api/companies/${companyId}/expense-split`, { method: 'POST', body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, text: d.error ?? 'Upload failed' });
      else { setMsg({ ok: true, text: `${d.count} expense heads loaded.` + (d.warnings?.length ? ' ' + d.warnings.join(' ') : '') }); setFile(null); await load(); }
    } catch { setMsg({ ok: false, text: 'Upload failed' }); }
    setBusy(false);
  }
  async function clear() {
    if (!confirm('Remove the uploaded expense split?')) return;
    await fetch(`/api/companies/${companyId}/expense-split`, { method: 'DELETE' });
    setRows([]); setMsg(null);
  }

  const totC = rows.reduce((s, r) => s + r.current, 0);
  const totP = rows.reduce((s, r) => s + r.previous, 0);
  // Which reported figure does the split add up to? Pick the closer of Other Expenses, or Other + Direct.
  const bases = [
    { label: 'Other Expenses', cur: A.otherExpenses, prev: P.otherExpenses },
    { label: 'Other + Employee/Direct Expenses', cur: A.otherExpenses + A.directExpenses, prev: P.otherExpenses + P.directExpenses },
  ];
  const base = Math.abs(totC - bases[0].cur) <= Math.abs(totC - bases[1].cur) ? bases[0] : bases[1];
  const diff = totC - base.cur;
  const top = rows.slice(0, 8);
  const maxV = Math.max(1, ...top.map((r) => Math.abs(r.current)));

  return (
    <div className="mt-8 print:break-inside-avoid">
      <h2 className="font-display font-semibold mb-1">Expense split — what is inside Other / Employee expenses</h2>
      <p className="text-xs text-inksoft mb-3">The financials give one line for these heads. Upload the split (expense head and amount) to see where the money actually goes.</p>
      <div className="card p-4 mb-4 border-dashed">
        <div className="flex items-center gap-2 flex-wrap">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setMsg(null); }}
            className="text-sm border border-rule rounded px-2 py-1.5 bg-[#FBF8EF] flex-1 min-w-[200px]" />
          <button onClick={upload} disabled={!file || busy}
            className="bg-brassdark text-white text-sm font-semibold px-4 py-1.5 rounded hover:bg-ink transition disabled:opacity-40">{busy ? 'Uploading…' : 'Upload split'}</button>
          <a href="/MIS_Expense_Split_Template.xlsx" download className="text-sm text-brassdark underline">Download template</a>
          {rows.length > 0 && <button onClick={clear} className="text-xs text-oxblood underline">Remove split</button>}
        </div>
        {msg && <p className={`text-xs mt-2 font-mono ${msg.ok ? 'text-forest' : 'text-oxblood'}`}>{msg.text}</p>}
      </div>

      {rows.length === 0 ? (
        <div className="note">No expense split uploaded yet. Download the template, list each expense head with its amount for this year (and last year if available), and upload it here.</div>
      ) : (
        <>
          <div className="space-y-1.5 mb-4">
            {top.map((r) => (
              <div key={r.head} className="flex items-center gap-2 text-xs">
                <span className="w-44 truncate text-inksoft" title={r.head}>{r.head}</span>
                <div className="flex-1 bg-[#EFE9D8] rounded h-3"><div className="h-3 rounded bg-brass" style={{ width: `${(Math.abs(r.current) / maxV) * 100}%` }} /></div>
                <span className="font-mono w-24 text-right">{formatINR(r.current)}</span>
              </div>
            ))}
          </div>
          <table className="datatable mb-3">
            <thead><tr><th>Expense head</th><th>{currentLabel}</th><th>% of split</th><th>% of Revenue</th><th>{previousLabel}</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.head}>
                  <td className="label">{r.head}</td><td>{formatINR(r.current)}</td>
                  <td>{totC ? ((r.current / totC) * 100).toFixed(1) : '0.0'}%</td>
                  <td>{A.revenue ? ((r.current / A.revenue) * 100).toFixed(1) : '0.0'}%</td>
                  <td>{r.previous ? formatINR(r.previous) : '—'}</td>
                  <td>{r.previous ? <ChangeBadge curr={r.current} prev={r.previous} goodIfUp={false} /> : '—'}</td>
                </tr>
              ))}
              <tr className="total"><td className="label">Total of split</td><td>{formatINR(totC)}</td><td>100.0%</td><td>{A.revenue ? ((totC / A.revenue) * 100).toFixed(1) : '0.0'}%</td><td>{totP ? formatINR(totP) : '—'}</td><td>{totP ? <ChangeBadge curr={totC} prev={totP} goodIfUp={false} /> : '—'}</td></tr>
            </tbody>
          </table>
          {Math.abs(diff) <= Math.max(1000, base.cur * 0.005)
            ? <div className="note">Reconciles to <b>{base.label}</b> in the financials ({formatINR(base.cur)}).</div>
            : <div className="note">Split total is {formatINR(Math.abs(diff))} {diff > 0 ? 'higher' : 'lower'} than <b>{base.label}</b> in the financials ({formatINR(base.cur)}). Check for missing or extra heads, or whether staff cost is included.</div>}
        </>
      )}
    </div>
  );
}

/* ================= Financial Ratios (+ relocated Total Debt / Net Worth) ================= */
function IdealRatioRow({ label, curr, prev, unit, ratioKey }: { label: string; curr: number; prev: number; unit: '%' | 'd' | 'x'; ratioKey: string }) {
  const def = IDEAL_RATIOS.find((d) => d.key === ratioKey)!;
  const { isGood, position, remark } = ratioVsIdeal(def, curr);
  const fmt = (v: number) => unit === '%' ? v.toFixed(2) + '%' : unit === 'd' ? v.toFixed(0) + 'd' : v.toFixed(2) + 'x';
  const arrow = position === 'at' ? '→' : position === 'above' ? '▲' : '▼';
  const posLabel = position === 'at' ? 'At ideal' : position === 'above' ? 'Above ideal' : 'Below ideal';
  return (
    <tr>
      <td className="label">{label}</td>
      <td>{fmt(curr)}</td>
      <td>{fmt(prev)}</td>
      <td>{fmt(def.ideal)}</td>
      <td><span className={`font-mono text-xs font-bold ${isGood ? 'text-forest' : 'text-oxblood'}`}>{arrow} {posLabel}</span></td>
      <td className="text-xs text-inksoft font-body">{remark}</td>
    </tr>
  );
}
function NoIdealRow({ label, curr, prev, unit }: { label: string; curr: number; prev: number; unit: '%' | 'd' | 'x' }) {
  const fmt = (v: number) => unit === '%' ? v.toFixed(2) + '%' : unit === 'd' ? v.toFixed(0) + 'd' : v.toFixed(2) + 'x';
  return (
    <tr>
      <td className="label">{label}</td>
      <td>{fmt(curr)}</td>
      <td>{fmt(prev)}</td>
      <td colSpan={3} className="text-xs text-inksoft font-body italic">No universal ideal — sector/business-model dependent. Compare against peers, not a fixed target.</td>
    </tr>
  );
}
const IDEAL_HEAD = <tr><th></th><th>FY-Curr</th><th>FY-Prev</th><th>Ideal</th><th>vs. Ideal</th><th>Remark</th></tr>;

function RatiosTab({ A, P, currentLabel, previousLabel }: any) {
  return (
    <div>
      <h1 className="sectitle"><span>Financial Ratios</span><span className="rule"></span></h1>
      <div className="note">&quot;Ideal&quot; values below are commonly-cited lender/textbook reference points, not a covenant specific to this company or a single authoritative source — treat them as a sanity-check line, not a hard pass/fail rule.</div>
      <div className="grid grid-cols-2 gap-3.5 mb-6">
        <KpiCard label="Total Debt" curr={A.totalDebt} prev={P.totalDebt} fmt={formatINR} goodIfUp={false} />
        <KpiCard label="Net Worth" curr={A.netWorth} prev={P.netWorth} fmt={formatINR} goodIfUp={true} />
      </div>

      <h2 className="font-display font-semibold mb-2">Liquidity</h2>
      <table className="datatable mb-6">
        <thead>{IDEAL_HEAD}</thead>
        <tbody>
          <IdealRatioRow label="Current Ratio" curr={A.currentRatio} prev={P.currentRatio} unit="x" ratioKey="currentRatio" />
          <IdealRatioRow label="Quick Ratio" curr={A.quickRatio} prev={P.quickRatio} unit="x" ratioKey="quickRatio" />
        </tbody>
      </table>

      <h2 className="font-display font-semibold mb-2">Solvency</h2>
      <table className="datatable mb-6">
        <thead>{IDEAL_HEAD}</thead>
        <tbody>
          <IdealRatioRow label="Debt-to-Equity" curr={A.debtEquity} prev={P.debtEquity} unit="x" ratioKey="debtEquity" />
          <IdealRatioRow label="Debt-to-EBITDA" curr={A.debtEbitda} prev={P.debtEbitda} unit="x" ratioKey="debtEbitda" />
          <IdealRatioRow label="Interest Coverage" curr={A.interestCoverage} prev={P.interestCoverage} unit="x" ratioKey="interestCoverage" />
        </tbody>
      </table>

      <h2 className="font-display font-semibold mb-2">Profitability <span className="text-xs font-normal text-inksoft">(no fixed ideal — see note above)</span></h2>
      <table className="datatable mb-6">
        <thead><tr><th></th><th>{currentLabel}</th><th>{previousLabel}</th><th colSpan={3}></th></tr></thead>
        <tbody>
          <NoIdealRow label="Gross Margin" curr={A.grossMargin} prev={P.grossMargin} unit="%" />
          <NoIdealRow label="EBITDA Margin" curr={A.ebitdaMargin} prev={P.ebitdaMargin} unit="%" />
          <NoIdealRow label="Net Profit Margin" curr={A.netMargin} prev={P.netMargin} unit="%" />
          <NoIdealRow label="ROCE" curr={A.roce} prev={P.roce} unit="%" />
          <NoIdealRow label="ROA" curr={A.roa} prev={P.roa} unit="%" />
        </tbody>
      </table>

      <h2 className="font-display font-semibold mb-2">Efficiency</h2>
      <table className="datatable mb-3">
        <thead>{IDEAL_HEAD}</thead>
        <tbody>
          <IdealRatioRow label="Debtor Days" curr={A.debtorDays} prev={P.debtorDays} unit="d" ratioKey="debtorDays" />
          <IdealRatioRow label="Inventory Days" curr={A.inventoryDays} prev={P.inventoryDays} unit="d" ratioKey="inventoryDays" />
        </tbody>
      </table>
      <table className="datatable mb-3">
        <thead><tr><th></th><th>{currentLabel}</th><th>{previousLabel}</th><th colSpan={3}></th></tr></thead>
        <tbody>
          <NoIdealRow label="Debtor Turnover" curr={A.debtorTurnover} prev={P.debtorTurnover} unit="x" />
          <NoIdealRow label="Creditor Turnover" curr={A.creditorTurnover} prev={P.creditorTurnover} unit="x" />
          <NoIdealRow label="Creditor Days" curr={A.creditorDays} prev={P.creditorDays} unit="d" />
          <NoIdealRow label="Inventory Turnover" curr={A.inventoryTurnover} prev={P.inventoryTurnover} unit="x" />
          <NoIdealRow label="Asset Turnover" curr={A.assetTurnover} prev={P.assetTurnover} unit="x" />
        </tbody>
      </table>
      <div className="note">Creditor Days has no single ideal shown here deliberately — direction of &quot;good&quot; depends on whether the counterparty is an MSME supplier (statutory 45-day ceiling) or not (longer is better) — see the Trade Payables tab for that split.</div>
    </div>
  );
}

/* ================= Working Capital (unchanged — already spec-compliant) ================= */
function WorkingCapitalTab({ A, P, currentLabel, previousLabel }: any) {
  const maxDays = Math.max(A.debtorDays, P.debtorDays, A.inventoryDays, P.inventoryDays, A.creditorDays, P.creditorDays, 1);
  return (
    <div>
      <h1 className="sectitle"><span>Working Capital</span><span className="rule"></span></h1>
      <table className="datatable mb-6">
        <thead><tr><th></th><th>{currentLabel}</th><th>{previousLabel}</th><th>Change</th></tr></thead>
        <tbody>
          <tr><td className="label">Current Assets</td><td>{formatINR(A.ca)}</td><td>{formatINR(P.ca)}</td><td><ChangeBadge curr={A.ca} prev={P.ca} goodIfUp={true} /></td></tr>
          <tr><td className="label">Current Liabilities</td><td>{formatINR(A.cl)}</td><td>{formatINR(P.cl)}</td><td><ChangeBadge curr={A.cl} prev={P.cl} goodIfUp={false} /></td></tr>
          <tr className="total"><td className="label">Net Working Capital</td><td>{formatINR(A.workingCapital)}</td><td>{formatINR(P.workingCapital)}</td><td><ChangeBadge curr={A.workingCapital} prev={P.workingCapital} goodIfUp={true} /></td></tr>
        </tbody>
      </table>
      <h2 className="font-display font-semibold mb-2">Cash Conversion Cycle</h2>
      <div className="flex gap-6 mb-6 mt-4">
        <Bar label="Debtor Days" curr={A.debtorDays} prev={P.debtorDays} max={maxDays} fmt={(v: number) => `${v.toFixed(0)}d`} />
        <Bar label="Inventory Days" curr={A.inventoryDays} prev={P.inventoryDays} max={maxDays} fmt={(v: number) => `${v.toFixed(0)}d`} />
        <Bar label="Creditor Days" curr={A.creditorDays} prev={P.creditorDays} max={maxDays} fmt={(v: number) => `${v.toFixed(0)}d`} />
      </div>
      <table className="datatable">
        <thead><tr><th></th><th>{currentLabel}</th><th>{previousLabel}</th></tr></thead>
        <tbody>
          <tr><td className="label">Debtor Days (DSO)</td><td>{A.debtorDays.toFixed(0)} days</td><td>{P.debtorDays.toFixed(0)} days</td></tr>
          <tr><td className="label">Inventory Days (DIO)</td><td>{A.inventoryDays.toFixed(0)} days</td><td>{P.inventoryDays.toFixed(0)} days</td></tr>
          <tr><td className="label">Creditor Days (DPO)</td><td>{A.creditorDays.toFixed(0)} days</td><td>{P.creditorDays.toFixed(0)} days</td></tr>
          <tr className="total"><td className="label">Cash Conversion Cycle</td><td>{A.ccc.toFixed(0)} days</td><td>{P.ccc.toFixed(0)} days</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/* ================= MSME & Funding (+ Health Score relocated here, + Alerts folded in) ================= */
function MsmeFundingTab({ A, health, msme, alerts }: any) {
  const gaps = computeFundingGaps(A);
  const order = { critical: 0, watch: 1, good: 2 } as Record<string, number>;
  const sortedAlerts = [...alerts].sort((a: any, b: any) => order[a.level] - order[b.level]);
  const tagLabel = { critical: 'Critical', watch: 'Attention', good: 'Positive' } as Record<string, string>;

  return (
    <div>
      <h1 className="sectitle"><span>MSME &amp; Funding</span><span className="rule"></span></h1>

      <div className="flex gap-6 items-center card p-5 mb-6 flex-wrap print:break-inside-avoid">
        <div className="w-28 h-28 rounded-full border-[6px] flex flex-col items-center justify-center flex-shrink-0"
          style={{ borderColor: health.band.cls === 'good' ? '#2E5339' : health.band.cls === 'watch' ? '#B8721A' : '#7A1F2B' }}>
          <span className="font-mono text-2xl font-bold">{health.total.toFixed(0)}</span>
          <span className="text-[0.6rem] text-inksoft">/100 {health.band.label}</span>
        </div>
        <div className="flex-1 min-w-[240px]">
          {health.breakdown.map((b: any) => (
            <div key={b.label} className="flex items-center gap-2.5 mb-1.5 text-sm">
              <span className="w-32 flex-shrink-0 text-inksoft text-xs">{b.label}</span>
              <div className="flex-1 h-2 bg-rule rounded overflow-hidden"><div className="h-full bg-brass" style={{ width: `${(b.score / b.max) * 100}%` }} /></div>
              <span className="w-12 text-right font-mono text-xs">{b.score.toFixed(0)}/{b.max}</span>
            </div>
          ))}
        </div>
      </div>

      <h2 className="font-display font-semibold mb-2">Management Alerts</h2>
      {sortedAlerts.map((a: any, i: number) => (
        <div key={i} className={`card p-4 mb-2.5 border-l-4 ${a.level === 'critical' ? 'border-l-oxblood' : a.level === 'watch' ? 'border-l-amber' : 'border-l-forest'} print:break-inside-avoid`}>
          <span className={`stamp ${a.level} mb-1.5 inline-block`}>{tagLabel[a.level]}</span>
          <h4 className="font-semibold text-sm mb-1">{a.title}</h4>
          <p className="text-sm text-inksoft">{a.text}</p>
        </div>
      ))}

      <h2 className="font-display font-semibold mb-2 mt-6">MSME Classification (Udyam)</h2>
      <div className="note mb-3">The MSMED Act covers manufacturing and service enterprises — pure trading businesses may not be eligible. Verify actual eligibility and classification on udyamregistration.gov.in before relying on this estimate.</div>
      <table className="datatable mb-6">
        <thead><tr><th></th><th>Value</th><th>Micro</th><th>Small</th><th>Medium</th></tr></thead>
        <tbody>
          <tr><td className="label">Investment (fixed assets, proxy)</td><td>{formatINR(msme.investment)}</td><td>≤₹2.5 Cr</td><td>≤₹25 Cr</td><td>≤₹125 Cr</td></tr>
          <tr><td className="label">Annual Turnover</td><td>{formatINR(msme.turnover)}</td><td>≤₹10 Cr</td><td>≤₹100 Cr</td><td>≤₹500 Cr</td></tr>
          <tr className="total"><td className="label">Likely classification</td><td colSpan={4}>{msme.category}</td></tr>
        </tbody>
      </table>

      <h2 className="font-display font-semibold mb-2">Funding Options to Explore</h2>
      <div className="note mb-3">No live connection to any government portal exists — every scheme below needs verification on the official link before applying, since terms change.</div>
      {FUNDING_SCHEMES.map((s) => (
        <div key={s.name} className="card p-4 mb-2.5 print:break-inside-avoid">
          <h4 className="font-semibold text-sm mb-1 flex items-center gap-2">{s.name} <span className="stamp good text-[0.55rem]">{s.type}</span></h4>
          <p className="text-sm text-inksoft mb-1">{s.desc}</p>
          <a href={s.link} target="_blank" rel="noopener" className="text-brassdark text-xs font-semibold">{s.link}</a>
        </div>
      ))}

      <h2 className="font-display font-semibold mb-2 mt-6">If You Need More Funding: Ratio Gaps to Close</h2>
      <table className="datatable">
        <thead><tr><th>Metric</th><th>Current</th><th>Typical Target</th><th>What Would Move It</th></tr></thead>
        <tbody>{gaps.map((g) => (<tr key={g.metric}><td className="label">{g.metric}</td><td>{g.current}</td><td>{g.target}</td><td>{g.action}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

/* ================= Ask the CFO Agent (unchanged) ================= */
function ChatTab({ companyId }: { companyId: string }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: "Hi — ask me anything about this company's financials: profitability, cash, debt, working capital, or what I'd prioritise." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const next = [...messages, { role: 'user' as const, content: input }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: next }) });
      const raw = await res.text();
      let d: any;
      try { d = JSON.parse(raw); } catch { throw new Error(`Unexpected response (HTTP ${res.status})`); }
      if (!res.ok) { setMessages([...next, { role: 'assistant', content: `Sorry, I couldn't reach the AI service. (${d.error})` }]); return; }
      setMessages([...next, { role: 'assistant', content: d.reply }]);
    } catch (e) {
      setMessages([...next, { role: 'assistant', content: `Sorry, something went wrong. (${e instanceof Error ? e.message : String(e)})` }]);
    } finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="sectitle"><span>Ask the CFO Agent</span><span className="rule"></span></h1>
      <div className="card flex flex-col h-[560px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {messages.map((m, i) => (<div key={i} className={`text-sm leading-relaxed max-w-[85%] px-3 py-2 rounded-lg whitespace-pre-wrap ${m.role === 'user' ? 'ml-auto bg-ink text-paper rounded-br-sm' : 'bg-[#EFEADA] rounded-bl-sm'}`}>{m.content}</div>))}
          {loading && <p className="text-inksoft text-sm italic">Thinking…</p>}
        </div>
        <div className="border-t border-rule p-3 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="Ask about revenue, margins, cash, debt…" className="flex-1 border border-rule rounded px-3 py-2 bg-[#FBF8EF] text-sm" />
          <button onClick={send} disabled={loading} className="bg-brassdark text-white px-4 rounded font-semibold text-sm disabled:opacity-50">Send</button>
        </div>
      </div>
    </div>
  );
}
