'use client';
import { useMemo, useState } from 'react';
import { formatINR } from '@/lib/compute';
import { Assumptions, buildScenarios, defaultAssumptions, runForecast } from '@/lib/forecast';

const COLORS: Record<string, string> = { base: '#1A2340', down: '#7A1F2B', up: '#2E5339', wc: '#A97C3F' };

function Field({ label, hint, value, onChange, step = 1, suffix }: { label: string; hint?: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string }) {
  return (
    <label className="block text-xs">
      <span className="font-semibold text-inksoft uppercase">{label}</span>
      <div className="flex items-center gap-1 mt-1">
        <input type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))}
          className="w-full border border-rule rounded px-2 py-1.5 bg-[#FBF8EF] font-mono text-sm" />
        {suffix && <span className="text-inksoft">{suffix}</span>}
      </div>
      {hint && <span className="text-[11px] text-inksoft">{hint}</span>}
    </label>
  );
}

function CashChart({ series, buffer }: { series: { key: string; name: string; values: number[] }[]; buffer: number }) {
  const W = 760, H = 260, L = 64, R = 12, T = 12, B = 28;
  const all = series.flatMap((s) => s.values).concat([0, buffer]);
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
  const x = (i: number) => L + (i * (W - L - R)) / 11;
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl">
      {ticks.map((t, i) => (
        <g key={i}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#E4DDC8" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#5A6275">{formatINR(t)}</text></g>
      ))}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#7A1F2B" strokeWidth="1" />
      <line x1={L} x2={W - R} y1={y(buffer)} y2={y(buffer)} stroke="#B8721A" strokeDasharray="5 4" />
      <text x={W - R} y={y(buffer) - 4} textAnchor="end" fontSize="10" fill="#B8721A">Minimum cash</text>
      {series.map((s) => (
        <polyline key={s.key} fill="none" stroke={COLORS[s.key]} strokeWidth={s.key === 'base' ? 2.6 : 1.8} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
      ))}
      {[0, 2, 5, 8, 11].map((i) => <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#5A6275">M{i + 1}</text>)}
    </svg>
  );
}

export default function ForecastTab({ A, P }: { A: any; P: any }) {
  const initial = useMemo(() => defaultAssumptions(A, P), [A, P]);
  const [a, setA] = useState<Assumptions>(initial);
  const [sel, setSel] = useState('base');
  const set = (k: keyof Assumptions) => (v: number) => setA((p) => ({ ...p, [k]: v }));

  const scenarios = useMemo(() => buildScenarios(A, a), [A, a]);
  const results = useMemo(() => scenarios.map((s) => ({ s, r: runForecast(A, s.a) })), [scenarios, A]);
  const cur = results.find((x) => x.s.key === sel) ?? results[0];
  const r = cur.r;
  const perDay = { dso: A.revenue / 365, dio: A.cogs / 365 };

  if (!A.revenue) return <div className="note">The forecast needs revenue and balance sheet figures. Upload the financials first.</div>;

  return (
    <div>
      <h1 className="sectitle"><span>12-Month Cash Forecast</span><span className="rule"></span></h1>
      <p className="note mb-4">
        {r.minCash < r.buffer
          ? <>In the <b>{cur.s.name}</b> case, cash falls to <b>{formatINR(r.minCash)}</b> in <b>{r.minMonth}</b>, below the minimum of {formatINR(r.buffer)} from <b>{r.firstBreach}</b>. Funding needed to stay above the minimum: <b>{formatINR(r.fundingNeed)}</b>.</>
          : <>In the <b>{cur.s.name}</b> case, cash stays above the minimum of {formatINR(r.buffer)} throughout. The lowest point is <b>{formatINR(r.minCash)}</b> in {r.minMonth}, and cash ends the year at <b>{formatINR(r.endCash)}</b>.</>}
      </p>

      <div className="card p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-sm">Assumptions (Base case)</h3>
          <button onClick={() => setA(initial)} className="text-xs text-brassdark underline">Reset</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Sales growth" suffix="% / yr" value={a.growthPct} onChange={set('growthPct')} hint={`Last year: ${P.revenue ? (((A.revenue - P.revenue) / P.revenue) * 100).toFixed(1) + '%' : 'n/a'}`} />
          <Field label="Gross margin shift" suffix="pts" step={0.5} value={a.gmShiftPts} onChange={set('gmShiftPts')} hint={`Now ${A.grossMargin.toFixed(1)}%`} />
          <Field label="Overhead growth" suffix="% / yr" value={a.opexInflationPct} onChange={set('opexInflationPct')} hint="Staff + other expenses" />
          <Field label="Minimum cash" suffix="days" value={a.bufferDays} onChange={set('bufferDays')} hint={`= ${formatINR(r.buffer)} of cash costs`} />
          <Field label="Receivable days" suffix="± days" value={a.dsoDelta} onChange={set('dsoDelta')} hint={`Now ${A.debtorDays.toFixed(0)} days; each day ≈ ${formatINR(perDay.dso)}`} />
          <Field label="Inventory days" suffix="± days" value={a.dioDelta} onChange={set('dioDelta')} hint={`Now ${A.inventoryDays.toFixed(0)} days; each day ≈ ${formatINR(perDay.dio)}`} />
          <Field label="Payable days" suffix="± days" value={a.dpoDelta} onChange={set('dpoDelta')} hint="MSME suppliers: keep within 45 days" />
          <Field label="Capex per month" suffix="₹" step={10000} value={a.capexMonthly} onChange={set('capexMonthly')} hint="Planned purchases of assets" />
          <Field label="Loan repaid per month" suffix="₹" step={10000} value={a.repayMonthly} onChange={set('repayMonthly')} hint="Principal only" />
          <Field label="New borrowing (month 1)" suffix="₹" step={100000} value={a.newBorrowing} onChange={set('newBorrowing')} />
        </div>
        <p className="text-[11px] text-inksoft mt-3">Starts from the cash on the latest balance sheet ({formatINR(A.cash)}). Day changes phase in over 6 months. Tax is paid in four equal instalments (months 3, 6, 9, 12).</p>
      </div>

      <h2 className="font-display font-semibold mb-2">Closing cash by scenario</h2>
      <CashChart series={results.map(({ s, r: rr }) => ({ key: s.key, name: s.name, values: rr.rows.map((x) => x.closing) }))} buffer={r.buffer} />
      <div className="flex gap-3 flex-wrap text-xs mb-5 mt-1">
        {scenarios.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded" style={{ background: COLORS[s.key] }} />{s.name}</span>)}
      </div>

      <table className="datatable mb-2">
        <thead><tr><th>Scenario</th><th>Lowest cash</th><th>Month</th><th>Cash at month 12</th><th>First below minimum</th><th>Funding needed</th></tr></thead>
        <tbody>
          {results.map(({ s, r: rr }) => (
            <tr key={s.key} onClick={() => setSel(s.key)} className={`cursor-pointer ${sel === s.key ? 'bg-brass/10' : ''}`}>
              <td className="label">{s.name}</td><td className={rr.minCash < 0 ? 'text-oxblood font-semibold' : ''}>{formatINR(rr.minCash)}</td><td>{rr.minMonth}</td>
              <td>{formatINR(rr.endCash)}</td><td>{rr.firstBreach ?? '—'}</td><td>{rr.fundingNeed ? formatINR(rr.fundingNeed) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-inksoft mb-5">{cur.s.note} Click a row to see its month-by-month detail below.</p>

      <h2 className="font-display font-semibold mb-2">Month by month: {cur.s.name}</h2>
      <div className="overflow-x-auto mb-5">
        <table className="datatable text-xs">
          <thead><tr><th></th>{r.rows.map((m) => <th key={m.label}>{m.label}</th>)}</tr></thead>
          <tbody>
            {([
              ['Opening cash', (i: number) => (i === 0 ? r.opening : r.rows[i - 1].closing)],
              ['Collections from customers', (i: number) => r.rows[i].collections],
              ['Other income', (i: number) => r.rows[i].otherIncome],
              ['Payments to suppliers', (i: number) => -r.rows[i].suppliers],
              ['Staff & other expenses', (i: number) => -r.rows[i].opex],
              ['Interest', (i: number) => -r.rows[i].interest],
              ['Tax', (i: number) => -r.rows[i].tax],
              ['Capex', (i: number) => -r.rows[i].capex],
              ['Loan drawn / (repaid)', (i: number) => r.rows[i].loan],
              ['Net cash flow', (i: number) => r.rows[i].net],
              ['Closing cash', (i: number) => r.rows[i].closing],
            ] as [string, (i: number) => number][]).map(([lab, f]) => (
              <tr key={lab} className={lab === 'Closing cash' || lab === 'Net cash flow' ? 'total' : ''}>
                <td className="label whitespace-nowrap">{lab}</td>
                {r.rows.map((_, i) => { const v = f(i); return <td key={i} className={`text-right font-mono ${v < 0 && (lab === 'Closing cash') ? 'text-oxblood' : ''}`}>{v === 0 ? '—' : formatINR(v)}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="font-display font-semibold mb-2">What moves cash fastest</h2>
      <div className="space-y-2 mb-4">
        <div className="note">Collecting <b>5 days faster</b> releases about <b>{formatINR(perDay.dso * 5)}</b> once, in cash.</div>
        <div className="note">Holding <b>5 days less stock</b> releases about <b>{formatINR(perDay.dio * 5)}</b>.</div>
        <div className="note">Paying suppliers <b>5 days later</b> keeps about <b>{formatINR(perDay.dio * 5)}</b> in the business, but MSME suppliers must be paid within 45 days (Sec 43B(h)).</div>
      </div>
      <p className="text-[11px] text-inksoft">Estimate from last year&apos;s figures. It assumes steady monthly sales (no seasonality), purchases follow sales, and all overheads move together. Review the assumptions before relying on it for a lending or funding decision.</p>
    </div>
  );
}
