'use client';
import { useState } from 'react';
import { formatINR } from '@/lib/compute';
import { buildLanding, Tone } from '@/lib/landing';
import {
  trFlag, inventoryFlag, tpOverallFlag, WcFlag,
  TR_BENCHMARK_DAYS, INVENTORY_BENCHMARK_DAYS, TP_MSME_BENCHMARK_DAYS,
} from '@/lib/workingCapitalCompute';

const toneDot: Record<Tone, string> = { good: 'bg-forest', watch: 'bg-amber', bad: 'bg-oxblood' };
const flagCls = (l: WcFlag['level']) => (l === 'good' ? 'good' : l === 'watch' ? 'watch' : 'critical');
const flagBar = (l: WcFlag['level']) => (l === 'good' ? '#2E5339' : l === 'watch' ? '#B8721A' : '#7A1F2B');
const rowsOf = (v: any): any[] => (Array.isArray(v) ? v : []);

export default function LandingOverview({ data, A, P, onJump }: any) {
  const [showChecks, setShowChecks] = useState(false);
  const ageing = {
    receivables: rowsOf(data.disclosedReceivablesAgeing),
    payablesMsme: rowsOf(data.disclosedPayablesMsmeAgeing),
    payablesOther: rowsOf(data.disclosedPayablesOtherAgeing),
    inventory: rowsOf(data.disclosedInventoryAgeing),
  };
  const L = buildLanding(A, P, ageing);
  const hasPrev = P.revenue > 0;

  // Working-capital cards
  const msmeAmt = ageing.payablesMsme.length ? ageing.payablesMsme.reduce((s: number, r: any) => s + r.amount, 0) : null;
  const othAmt = ageing.payablesOther.length ? ageing.payablesOther.reduce((s: number, r: any) => s + r.amount, 0) : null;
  const tp = tpOverallFlag(A.creditorDays, msmeAmt, othAmt, A.purchases);
  const wcCards = [
    {
      name: 'Trade receivables', value: A.receivables, days: A.debtorDays, prev: P.debtorDays, flag: trFlag(A.debtorDays), max: 130, jump: 1,
      bench: `Benchmark ${TR_BENCHMARK_DAYS} days`,
      note: A.revenue ? `Every day above ${TR_BENCHMARK_DAYS} holds ~${formatINR(A.revenue / 365)} of cash.` : '',
    },
    {
      name: 'Inventory', value: A.inventories, days: A.inventoryDays, prev: P.inventoryDays, flag: inventoryFlag(A.inventoryDays), max: 110, jump: 3,
      bench: `Benchmark ${INVENTORY_BENCHMARK_DAYS} days`,
      note: A.cogs ? `Every day above ${INVENTORY_BENCHMARK_DAYS} holds ~${formatINR(A.cogs / 365)} of cash.` : '',
    },
    {
      name: 'Trade payables', value: A.tradePayables, days: A.creditorDays, prev: P.creditorDays, flag: tp.overall, max: 110, jump: 2,
      bench: tp.hasSplit ? `MSME limit ${TP_MSME_BENCHMARK_DAYS} days` : 'Longer is better (no MSME split uploaded)',
      note: tp.hasSplit && tp.msme ? `MSME vendors ≈ ${tp.msme.days.toFixed(0)} days of purchases; others ≈ ${tp.nonMsme?.days.toFixed(0)}.` : 'Upload payables ageing with an MSME column for compliance view.',
    },
  ];

  return (
    <div>
      {/* Data-quality badge */}
      <div className="flex justify-end mb-3 print:hidden">
        <button onClick={() => setShowChecks((s) => !s)}
          className={`text-xs font-semibold px-3 py-1.5 rounded border ${L.checksPassed === L.checksApplicable ? 'text-forest bg-forestbg border-forest' : 'text-amber bg-amberbg border-amber'}`}>
          {L.checksPassed === L.checksApplicable ? '✓' : '⚠'} Data quality: {L.checksPassed} of {L.checksApplicable} checks passed{L.checksPassed < L.checksApplicable ? ` – review ${L.checksApplicable - L.checksPassed}` : ''}
        </button>
      </div>
      {showChecks && (
        <div className="card p-4 mb-4">
          <h3 className="font-display font-semibold mb-2 text-sm uppercase tracking-wide text-inksoft">Data-quality checks</h3>
          <ul className="text-sm space-y-1.5">
            {L.checks.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span>{c.status === 'ok' ? '✅' : c.status === 'warn' ? '⚠️' : '➖'}</span><span>{c.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {L.kpis.map((k) => {
          const up = (k.delta ?? 0) >= 0;
          const flat = k.delta === null || Math.abs(k.delta) < 0.05;
          const good = flat ? null : up === k.goodIfUp;
          return (
            <div key={k.label} className="card p-3">
              <div className="text-[0.7rem] uppercase tracking-wide text-inksoft">{k.label}</div>
              <div className="font-display font-semibold text-xl my-1">{k.value}</div>
              <div className={`font-mono text-xs font-bold ${flat ? 'text-inksoft' : good ? 'text-forest' : 'text-oxblood'}`}>
                {k.delta === null ? 'no prior year' : <>{flat ? '→' : up ? '▲' : '▼'} {Math.abs(k.delta).toFixed(1)}{k.unit === 'pts' ? ' pts' : '%'} <span className="text-inksoft font-normal">vs last yr</span></>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Management summary */}
      <div className="card p-5 mb-5">
        <h3 className="font-display font-semibold mb-3 text-sm uppercase tracking-wide text-inksoft">
          Management summary <span className="normal-case font-normal text-xs">· calculated from your statements, no AI · max 10 lines</span>
        </h3>
        <ul className="space-y-2">
          {L.summary.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${toneDot[s.tone]}`} />
              <span>{s.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Working capital */}
      <h3 className="font-display font-semibold mb-3 text-sm uppercase tracking-wide text-inksoft">Working capital — the three levers</h3>
      <div className="grid md:grid-cols-3 gap-3 mb-5">
        {wcCards.map((w) => (
          <button key={w.name} onClick={() => onJump(w.jump)} className="card p-4 text-left hover:border-brass transition">
            <div className="text-xs text-inksoft font-semibold">{w.name}</div>
            <div className="font-display font-semibold text-2xl my-1">{formatINR(w.value)}</div>
            <span className={`stamp ${flagCls(w.flag.level)}`}>{w.days.toFixed(0)} days · {w.flag.label}</span>
            <div className="h-1.5 bg-rule/50 rounded my-2.5"><div className="h-full rounded" style={{ width: `${Math.min(100, (w.days / w.max) * 100)}%`, background: flagBar(w.flag.level) }} /></div>
            <div className="text-xs text-inksoft">{w.bench}{hasPrev ? ` · last year ${w.prev.toFixed(0)} days` : ''}</div>
            <div className="text-xs mt-1.5">{w.note}</div>
            <div className="text-xs text-brassdark mt-2">See detail →</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="card p-5 lg:col-span-3">
          <h3 className="font-display font-semibold mb-2 text-sm uppercase tracking-wide text-inksoft">Why did profit change? (PAT bridge)</h3>
          {hasPrev ? <Bridge steps={L.bridge.steps} /> : <p className="text-sm text-inksoft">Needs a previous-year column in the upload.</p>}
          <p className="text-xs text-inksoft mt-2">
            Revenue effect = extra sales × last year&apos;s gross-margin %; margin effect = change in gross-margin % × this year&apos;s sales. Shows <i>what</i> moved — not volume vs price, which the statements don&apos;t contain.
          </p>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <h3 className="font-display font-semibold mb-2 text-sm uppercase tracking-wide text-inksoft">Needs attention (top {Math.max(L.alerts.length, 1)})</h3>
            {L.alerts.length === 0 && <p className="text-sm text-forest">Nothing flagged. Margins, cash cycle and leverage are inside their benchmarks.</p>}
            <ul className="divide-y divide-rule">
              {L.alerts.map((a, i) => (
                <li key={i} className="py-2 flex gap-2.5">
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${a.tone === 'bad' ? 'bg-oxblood' : 'bg-amber'}`} />
                  <div className="text-sm">
                    <div className="font-semibold">{a.jump ? <button className="text-left hover:underline" onClick={() => onJump(a.jump)}>{a.title}</button> : a.title}</div>
                    <div className="text-xs text-inksoft">{a.text}</div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[0.7rem] text-inksoft mt-2">Capped at 5, ranked by severity then cash impact.</p>
          </div>
          <div className="card p-5">
            <h3 className="font-display font-semibold mb-2 text-sm uppercase tracking-wide text-inksoft">Break-even estimate</h3>
            {L.breakEven ? (
              <>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-rule"><td className="py-1.5">Fixed costs (staff, other expenses, interest, depreciation)</td><td className="text-right font-mono">{formatINR(L.breakEven.fixed)}</td></tr>
                    <tr className="border-b border-rule"><td className="py-1.5">Contribution margin (= gross margin)</td><td className="text-right font-mono">{L.breakEven.contributionMargin.toFixed(1)}%</td></tr>
                    <tr className="border-b border-rule"><td className="py-1.5 font-semibold">Break-even revenue</td><td className="text-right font-mono font-semibold">{formatINR(L.breakEven.revenue)}</td></tr>
                    <tr><td className="py-1.5">Margin of safety</td><td className={`text-right font-mono font-semibold ${L.breakEven.marginOfSafety < 0 ? 'text-oxblood' : ''}`}>{L.breakEven.marginOfSafety.toFixed(0)}%</td></tr>
                  </tbody>
                </table>
                <p className="text-[0.7rem] text-inksoft mt-2">Estimate: assumes purchases are fully variable and every other cost is fixed. Real cost behaviour differs.</p>
              </>
            ) : <p className="text-sm text-inksoft">Not available (needs positive revenue and gross profit).</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bridge({ steps }: { steps: { label: string; value: number; total?: boolean }[] }) {
  // Build running positions; handle negative totals by sizing against the extremes of the walk.
  let run = 0;
  const bars = steps.map((s) => {
    if (s.total) { run = s.value; return { ...s, lo: Math.min(0, s.value), hi: Math.max(0, s.value) }; }
    const from = run; run += s.value;
    return { ...s, lo: Math.min(from, run), hi: Math.max(from, run) };
  });
  const min = Math.min(0, ...bars.map((b) => b.lo)), max = Math.max(1, ...bars.map((b) => b.hi));
  const W = 620, H = 260, padX = 14, top = 22, bottom = 44;
  const n = bars.length, slot = (W - padX * 2) / n, bw = Math.min(46, slot * 0.7);
  const y = (v: number) => top + ((max - v) / (max - min)) * (H - top - bottom);
  const lakh = (v: number) => { const a = Math.abs(v); return (v < 0 ? '−' : '') + (a >= 1e7 ? (a / 1e7).toFixed(2) + ' Cr' : (a / 1e5).toFixed(1) + ' L'); };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={padX} x2={W - padX} y1={y(0)} y2={y(0)} stroke="#D8D0BC" />
      {bars.map((b, i) => {
        const x = padX + i * slot + (slot - bw) / 2;
        const fill = b.total ? '#14213D' : b.value >= 0 ? '#2E5339' : '#7A1F2B';
        const words = b.label.split(' ');
        return (
          <g key={i}>
            <rect x={x} y={y(b.hi)} width={bw} height={Math.max(2, y(b.lo) - y(b.hi))} rx={2} fill={fill} />
            <text x={x + bw / 2} y={y(b.hi) - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="#14213D">{b.total ? lakh(b.value) : (b.value >= 0 ? '+' : '') + lakh(b.value)}</text>
            <text textAnchor="middle" fontSize="9" fill="#3A4A6B">
              {words.map((w, j) => <tspan key={j} x={x + bw / 2} y={H - bottom + 14 + j * 11}>{w}</tspan>)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
