/**
 * Landing-page (Overview) analytics — pure, deterministic, rule-based. No AI.
 * Everything here is computed from the uploaded statements (DerivedMetrics for current and
 * previous year) plus the optional ageing listings. Amounts are in rupees.
 */
import { DerivedMetrics } from './types';
import { formatINR, pctChange } from './compute';
import { TR_BENCHMARK_DAYS, INVENTORY_BENCHMARK_DAYS, TP_MSME_BENCHMARK_DAYS } from './workingCapitalCompute';

export interface AgeingInput {
  receivables?: { name: string; amount: number; days: number }[] | null;
  payablesMsme?: { name: string; amount: number; days: number }[] | null;
  payablesOther?: { name: string; amount: number; days: number }[] | null;
  inventory?: { name: string; amount: number; days: number }[] | null;
}

export type Tone = 'good' | 'watch' | 'bad';

export interface Kpi { label: string; value: string; delta: number | null; unit: '%' | 'pts'; goodIfUp: boolean }
export interface SummaryLine { tone: Tone; text: string }
export interface BridgeStep { label: string; value: number; total?: boolean }
export interface Check { status: 'ok' | 'warn' | 'na'; text: string }
export interface LandingAlert { tone: 'bad' | 'watch'; title: string; text: string; jump?: number; impact: number }
export interface BreakEven { fixed: number; contributionMargin: number; revenue: number; marginOfSafety: number }

export interface LandingData {
  kpis: Kpi[];
  summary: SummaryLine[];
  bridge: { steps: BridgeStep[]; largest: string | null };
  checks: Check[];
  checksPassed: number;
  checksApplicable: number;
  breakEven: BreakEven | null;
  alerts: LandingAlert[];
  wc: { earned: number; absorbed: number; dTR: number; dINV: number; dTP: number; dCash: number };
}

const sum = (rows?: { amount: number }[] | null) => (rows ?? []).reduce((s, r) => s + r.amount, 0);
const abs = Math.abs;
const money = (v: number) => formatINR(v);
const days0 = (v: number) => Math.round(v).toString();

function growthText(curr: number, prev: number): { dir: 'grew' | 'fell'; pct: number } | null {
  const g = pctChange(curr, prev);
  if (g === null) return null;
  return { dir: g >= 0 ? 'grew' : 'fell', pct: abs(g) };
}

/** Bridge from last year's PAT to this year's PAT. Revenue effect = extra sales at last year's
 *  gross-margin %; margin effect = change in gross-margin % on this year's sales; remaining
 *  lines are straight differences. Any gap to the reported PAT is shown as its own step so the
 *  bridge always reconciles — we never plug it silently. */
export function patBridge(A: DerivedMetrics, P: DerivedMetrics): { steps: BridgeStep[]; largest: string | null } {
  const prevGm = P.revenue ? P.grossProfit / P.revenue : 0;
  const currGm = A.revenue ? A.grossProfit / A.revenue : 0;
  const revenueEffect = (A.revenue - P.revenue) * prevGm;
  const marginEffect = (currGm - prevGm) * A.revenue;
  const ovh = (d: DerivedMetrics) => d.directExpenses + d.otherExpenses;
  const parts: BridgeStep[] = [
    { label: 'Revenue growth', value: revenueEffect },
    { label: 'Gross margin', value: marginEffect },
    { label: 'Overheads', value: -(ovh(A) - ovh(P)) },
    { label: 'Other income', value: A.otherIncome - P.otherIncome },
    { label: 'Finance cost', value: -(A.financeCost - P.financeCost) },
    { label: 'Depreciation', value: -(A.depreciation - P.depreciation) },
    { label: 'Tax', value: -(A.tax - P.tax) },
  ];
  const explained = parts.reduce((s, p) => s + p.value, 0);
  const residual = (A.pat - P.pat) - explained;
  if (abs(residual) > Math.max(1000, 0.01 * abs(A.pat - P.pat))) parts.push({ label: 'Other / unreconciled', value: residual });
  const steps: BridgeStep[] = [{ label: 'Last year PAT', value: P.pat, total: true }, ...parts, { label: 'This year PAT', value: A.pat, total: true }];
  const big = [...parts].sort((a, b) => abs(b.value) - abs(a.value))[0];
  return { steps, largest: big && abs(big.value) > 0 ? big.label : null };
}

export function reconciliationChecks(A: DerivedMetrics, ageing: AgeingInput): Check[] {
  const checks: Check[] = [];
  const near = (a: number, b: number, tolPct: number) => abs(a - b) <= Math.max(1000, (tolPct / 100) * Math.max(abs(a), abs(b)));

  const liabilities = A.ownersCapital + A.ncl + A.cl;
  if (!A.totalAssets && !liabilities) checks.push({ status: 'warn', text: 'Balance sheet items not found in the upload.' });
  else if (near(A.totalAssets, liabilities, 1)) checks.push({ status: 'ok', text: `Balance sheet balances (assets ${money(A.totalAssets)} = liabilities ${money(liabilities)}).` });
  else checks.push({ status: 'warn', text: `Balance sheet does not balance: assets ${money(A.totalAssets)} vs equity + liabilities ${money(liabilities)} (gap ${money(abs(A.totalAssets - liabilities))}). Some lines may be missing or mis-read.` });

  const recomputedPat = A.grossProfit + A.otherIncome - A.directExpenses - A.otherExpenses - A.financeCost - A.depreciation - A.tax;
  if (near(recomputedPat, A.pat, 1)) checks.push({ status: 'ok', text: `Reported PAT matches recomputed PAT (${money(A.pat)}).` });
  else checks.push({ status: 'warn', text: `Reported PAT ${money(A.pat)} differs from recomputed ${money(recomputedPat)} — exceptional items or a missing P&L line.` });

  const listing = (name: string, listed: number | null, bs: number) => {
    if (listed === null) { checks.push({ status: 'na', text: `${name} listing not uploaded — ageing analysis unavailable.` }); return; }
    if (near(listed, bs, 2)) checks.push({ status: 'ok', text: `${name} listing ${money(listed)} ties to balance sheet ${money(bs)}.` });
    else {
      const cover = bs ? (listed / bs) * 100 : 0;
      checks.push({ status: 'warn', text: `${name} listing ${money(listed)} vs balance sheet ${money(bs)} — ageing covers ${cover.toFixed(0)}% of the balance.` });
    }
  };
  listing('Receivables', ageing.receivables?.length ? sum(ageing.receivables) : null, A.receivables);
  const tp = (ageing.payablesMsme?.length || ageing.payablesOther?.length) ? sum(ageing.payablesMsme) + sum(ageing.payablesOther) : null;
  listing('Payables', tp, A.tradePayables);
  listing('Inventory', ageing.inventory?.length ? sum(ageing.inventory) : null, A.inventories);
  return checks;
}

export function breakEven(A: DerivedMetrics): BreakEven | null {
  if (A.revenue <= 0 || A.grossProfit <= 0) return null;
  const fixed = A.directExpenses + A.otherExpenses + A.financeCost + A.depreciation;
  const cm = A.grossProfit / A.revenue;
  const revenue = fixed / cm;
  return { fixed, contributionMargin: cm * 100, revenue, marginOfSafety: ((A.revenue - revenue) / A.revenue) * 100 };
}

export function buildLanding(A: DerivedMetrics, P: DerivedMetrics, ageing: AgeingInput): LandingData {
  const hasPrev = P.revenue > 0;
  const delta = (c: number, p: number) => (hasPrev ? pctChange(c, p) : null);

  const kpis: Kpi[] = [
    { label: 'Revenue', value: money(A.revenue), delta: delta(A.revenue, P.revenue), unit: '%', goodIfUp: true },
    { label: 'EBITDA', value: money(A.ebitda), delta: delta(A.ebitda, P.ebitda), unit: '%', goodIfUp: true },
    { label: 'EBITDA margin', value: `${A.ebitdaMargin.toFixed(1)}%`, delta: hasPrev ? A.ebitdaMargin - P.ebitdaMargin : null, unit: 'pts', goodIfUp: true },
    { label: 'Profit after tax', value: money(A.pat), delta: delta(A.pat, P.pat), unit: '%', goodIfUp: true },
    { label: 'PAT margin', value: `${A.netMargin.toFixed(1)}%`, delta: hasPrev ? A.netMargin - P.netMargin : null, unit: 'pts', goodIfUp: true },
    { label: 'Cash balance', value: money(A.cash), delta: delta(A.cash, P.cash), unit: '%', goodIfUp: true },
  ];

  const bridge = patBridge(A, P);
  const dTR = A.receivables - P.receivables, dINV = A.inventories - P.inventories, dTP = A.tradePayables - P.tradePayables;
  const absorbed = dTR + dINV - dTP;
  const earned = A.pat + A.depreciation;
  const dCash = A.cash - P.cash;
  const wc = { earned, absorbed, dTR, dINV, dTP, dCash };

  // ---------- Management summary (priority order, max 10 lines) ----------
  const S: SummaryLine[] = [];
  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${money(abs(v))}`;

  const rg = growthText(A.revenue, P.revenue);
  if (hasPrev && rg) S.push({ tone: rg.dir === 'grew' ? 'good' : 'bad', text: `Revenue ${rg.dir} ${rg.pct.toFixed(1)}% to ${money(A.revenue)} (from ${money(P.revenue)}).` });
  else S.push({ tone: 'watch', text: `Revenue is ${money(A.revenue)}; no usable previous-year figure to compare against.` });

  if (hasPrev && A.revenue > 0) {
    const gmd = A.grossMargin - P.grossMargin;
    const worth = abs((gmd / 100) * A.revenue);
    if (abs(gmd) < 0.3) S.push({ tone: 'good', text: `Gross margin is stable at ${A.grossMargin.toFixed(1)}% (${gmd >= 0 ? '+' : '−'}${abs(gmd).toFixed(1)} pts).` });
    else S.push({ tone: gmd > 0 ? 'good' : 'bad', text: `Gross margin ${gmd > 0 ? 'improved' : 'slipped'} ${abs(gmd).toFixed(1)} pts to ${A.grossMargin.toFixed(1)}%, worth ${money(worth)} of profit.` });

    const ovh = (d: DerivedMetrics) => d.directExpenses + d.otherExpenses;
    const og = pctChange(ovh(A), ovh(P));
    if (og !== null && rg) {
      const slower = og < (pctChange(A.revenue, P.revenue) ?? 0);
      S.push({ tone: slower ? 'good' : 'watch', text: `Overheads (staff + other expenses) ${og >= 0 ? 'rose' : 'fell'} ${abs(og).toFixed(1)}%, ${slower ? 'slower than revenue — operating leverage is helping' : 'faster than revenue — costs are absorbing the growth'}.` });
    }
  }

  const eg = growthText(A.ebitda, P.ebitda);
  S.push({ tone: A.ebitda > 0 && (!eg || eg.dir === 'grew') ? 'good' : A.ebitda > 0 ? 'watch' : 'bad', text: `EBITDA is ${money(A.ebitda)} (${A.ebitdaMargin.toFixed(1)}% margin)${hasPrev && eg ? `, ${eg.dir === 'grew' ? 'up' : 'down'} ${eg.pct.toFixed(1)}%` : ''}.` });

  const driver = hasPrev && bridge.largest ? ` Biggest driver: ${bridge.largest.toLowerCase()}.` : '';
  if (A.pat < 0) S.push({ tone: 'bad', text: `Net loss of ${money(abs(A.pat))} (${A.netMargin.toFixed(1)}% of revenue)${hasPrev ? `, vs ${P.pat >= 0 ? 'profit' : 'loss'} of ${money(abs(P.pat))} last year` : ''}.${driver}` });
  else if (hasPrev && P.pat <= 0) S.push({ tone: 'good', text: `PAT turned positive at ${money(A.pat)} (${A.netMargin.toFixed(1)}% of revenue) from ${P.pat < 0 ? 'a loss of ' + money(abs(P.pat)) : 'nil'}.${driver}` });
  else {
    const pg = growthText(A.pat, P.pat);
    S.push({ tone: pg && pg.dir === 'fell' ? 'bad' : 'good', text: `PAT is ${money(A.pat)} (${A.netMargin.toFixed(1)}% of revenue)${pg ? `, ${pg.dir === 'grew' ? 'up' : 'down'} ${pg.pct.toFixed(1)}%` : ''}.${driver}` });
  }

  if (A.revenue > 0 && A.receivables > 0) {
    const more = hasPrev ? ((A.debtorDays - P.debtorDays) / 365) * A.revenue : 0;
    const tone: Tone = A.debtorDays > TR_BENCHMARK_DAYS ? 'bad' : A.debtorDays >= 80 ? 'watch' : 'good';
    S.push({ tone, text: `Debtor days ${hasPrev ? (A.debtorDays >= P.debtorDays ? 'rose' : 'fell') + ' to' : 'are'} ${days0(A.debtorDays)}${hasPrev ? ` from ${days0(P.debtorDays)}` : ''} (benchmark ${TR_BENCHMARK_DAYS})${hasPrev && abs(more) >= 1 ? `: ${money(abs(more))} ${more > 0 ? 'more' : 'less'} cash is tied up with customers than last year` : ''}.` });
  }
  if (A.cogs > 0 && A.inventories > 0) {
    const tone: Tone = A.inventoryDays > INVENTORY_BENCHMARK_DAYS ? 'bad' : A.inventoryDays >= 50 ? 'watch' : 'good';
    S.push({ tone, text: `Inventory days are ${days0(A.inventoryDays)}${hasPrev ? ` vs ${days0(P.inventoryDays)}` : ''} (benchmark ${INVENTORY_BENCHMARK_DAYS}) — ${money(A.inventories)} held in stock.` });
  }
  if (hasPrev && earned > 0) {
    const share = absorbed / earned;
    S.push({ tone: share > 0.4 ? 'bad' : absorbed > 0 ? 'watch' : 'good', text: `Of ${money(earned)} earned (PAT + depreciation), ${absorbed >= 0 ? money(absorbed) + ' was absorbed by' : money(abs(absorbed)) + ' was released from'} working capital (debtors ${signed(dTR)}, stock ${signed(dINV)}, payables ${signed(dTP)}); cash ${dCash >= 0 ? 'rose' : 'fell'} ${money(abs(dCash))}.` });
  }
  const msmeBreach = (ageing.payablesMsme ?? []).filter((r) => r.days > TP_MSME_BENCHMARK_DAYS);
  if (msmeBreach.length) {
    const amt = msmeBreach.reduce((s, r) => s + r.amount, 0);
    S.push({ tone: 'bad', text: `${msmeBreach.length} MSME vendor${msmeBreach.length > 1 ? 's are' : ' is'} paid beyond ${TP_MSME_BENCHMARK_DAYS} days (${money(amt)}) — Sec 43B(h) disallowance and interest risk.` });
  } else if (A.purchases > 0 && A.tradePayables > 0) {
    S.push({ tone: A.creditorDays >= 45 ? 'good' : 'watch', text: `Creditor days are ${days0(A.creditorDays)}${A.creditorDays >= 45 ? ' — suppliers are financing a healthy part of the cycle' : ' — paying suppliers faster than needed'}.` });
  }
  if (A.totalDebt <= 0) S.push({ tone: 'good', text: 'No borrowings reported — the business is debt-free.' });
  else if (A.ebitda > 0) {
    const de = A.totalDebt / A.ebitda;
    S.push({ tone: de > 4 ? 'bad' : de > 3 ? 'watch' : 'good', text: `Debt ${money(A.totalDebt)} = ${de.toFixed(1)}x EBITDA${A.financeCost > 0 ? `; interest covered ${A.interestCoverage.toFixed(1)}x` : ''}${de > 3 ? ' — above the comfortable 3x level' : ' — within comfortable levels'}.` });
  } else S.push({ tone: 'bad', text: `Debt of ${money(A.totalDebt)} against negative EBITDA — repayment depends on external funding.` });

  const order: Record<Tone, number> = { bad: 0, watch: 1, good: 2 };
  let summary = S;
  if (S.length > 10) {
    // Keep the first 4 (revenue → PAT story); then prefer concerns over comfort.
    const head = S.slice(0, 4), rest = S.slice(4).map((s, i) => ({ s, i })).sort((a, b) => order[a.s.tone] - order[b.s.tone] || a.i - b.i).slice(0, 6).sort((a, b) => a.i - b.i).map((x) => x.s);
    summary = [...head, ...rest];
  }

  // ---------- Alerts (max 5, ranked: bad first, then cash impact) ----------
  const checks = reconciliationChecks(A, ageing);
  const al: LandingAlert[] = [];
  if (A.receivables > 0 && A.debtorDays > TR_BENCHMARK_DAYS) {
    const x = ((A.debtorDays - TR_BENCHMARK_DAYS) / 365) * A.revenue;
    al.push({ tone: 'bad', title: `Debtor days ${days0(A.debtorDays)} (benchmark ${TR_BENCHMARK_DAYS})`, text: `${money(x)} of cash sits above the benchmark level.`, jump: 1, impact: x });
  } else if (A.receivables > 0 && A.debtorDays >= 80) {
    al.push({ tone: 'watch', title: `Debtor days ${days0(A.debtorDays)} — nearing ${TR_BENCHMARK_DAYS}`, text: 'Collections are slowing; review the top overdue customers.', jump: 1, impact: ((A.debtorDays - 80) / 365) * A.revenue });
  }
  if (A.inventories > 0 && A.inventoryDays > INVENTORY_BENCHMARK_DAYS) {
    const x = ((A.inventoryDays - INVENTORY_BENCHMARK_DAYS) / 365) * A.cogs;
    al.push({ tone: 'bad', title: `Inventory days ${days0(A.inventoryDays)} (benchmark ${INVENTORY_BENCHMARK_DAYS})`, text: `${money(x)} above the benchmark stock level.`, jump: 3, impact: x });
  }
  if (hasPrev && earned > 0 && absorbed > 0 && absorbed / earned > 0.4) {
    al.push({ tone: 'bad', title: `${money(absorbed)} of earnings absorbed by working capital`, text: `${((absorbed / earned) * 100).toFixed(0)}% of PAT + depreciation (${money(earned)}); cash ${dCash >= 0 ? 'rose only' : 'fell'} ${money(abs(dCash))}.`, impact: absorbed });
  }
  if (msmeBreach.length) {
    const amt = msmeBreach.reduce((s, r) => s + r.amount, 0);
    al.push({ tone: 'watch', title: 'MSME vendors paid beyond 45 days', text: `${money(amt)} outstanding to ${msmeBreach.length} vendor(s); expense disallowed until paid (Sec 43B(h)).`, jump: 2, impact: amt * 0.25 });
  }
  if (A.pat < 0) al.push({ tone: 'bad', title: 'Business is loss-making', text: `Net loss ${money(abs(A.pat))}; break-even needs higher gross profit or lower fixed costs.`, impact: abs(A.pat) });
  if (A.financeCost > 0 && A.interestCoverage < 1.5) al.push({ tone: 'bad', title: `Interest cover only ${A.interestCoverage.toFixed(1)}x`, text: 'Operating profit barely covers interest (comfort level is 3x).', impact: A.financeCost });
  if (A.cl > 0 && A.currentRatio < 1) al.push({ tone: 'bad', title: `Current ratio ${A.currentRatio.toFixed(2)}x (below 1)`, text: 'Short-term liabilities exceed current assets.', impact: A.cl - A.ca });
  if (hasPrev && P.ebitdaMargin - A.ebitdaMargin >= 3) al.push({ tone: 'watch', title: `EBITDA margin fell ${(P.ebitdaMargin - A.ebitdaMargin).toFixed(1)} pts`, text: `From ${P.ebitdaMargin.toFixed(1)}% to ${A.ebitdaMargin.toFixed(1)}%.`, impact: ((P.ebitdaMargin - A.ebitdaMargin) / 100) * A.revenue });
  const firstWarn = checks.find((c) => c.status === 'warn');
  if (firstWarn) al.push({ tone: 'watch', title: 'Data needs review', text: firstWarn.text, impact: 0 });
  al.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'bad' ? -1 : 1) || b.impact - a.impact);

  return {
    kpis, summary, bridge, checks,
    checksApplicable: checks.filter((c) => c.status !== 'na').length,
    checksPassed: checks.filter((c) => c.status === 'ok').length,
    breakEven: breakEven(A),
    alerts: al.slice(0, 5),
    wc,
  };
}
