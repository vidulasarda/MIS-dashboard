import { DerivedMetrics } from './types';

/**
 * 12-month cash forecast. Driver-based: revenue growth, gross margin, collection / stock / payment days,
 * overheads, interest, tax, capex and loan movements. Opening position = latest balance sheet.
 * Every figure is an estimate built from the last full year; there is no seasonality in the data.
 */
export interface Assumptions {
  growthPct: number;       // annual revenue growth, %
  gmShiftPts: number;      // change in gross margin, percentage points
  dsoDelta: number;        // change in receivable days (phased in over 6 months)
  dioDelta: number;        // change in inventory days
  dpoDelta: number;        // change in payable days
  opexInflationPct: number;// annual growth in overheads (staff + other expenses), %
  capexMonthly: number;    // ₹ per month
  repayMonthly: number;    // ₹ per month of loan principal repaid
  newBorrowing: number;    // ₹ drawn in month 1
  bufferDays: number;      // minimum cash wanted, in days of cash costs
}

export interface MonthRow {
  label: string; revenue: number; collections: number; otherIncome: number; suppliers: number; opex: number;
  interest: number; tax: number; capex: number; loan: number; net: number; closing: number;
  ar: number; inv: number; ap: number;
}
export interface ForecastResult {
  rows: MonthRow[]; opening: number; buffer: number;
  minCash: number; minMonth: string; minIndex: number; endCash: number;
  firstBreach: string | null; fundingNeed: number; ebitda: number; pbt: number;
}

const D = 30.4167;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function defaultAssumptions(A: DerivedMetrics, P: DerivedMetrics): Assumptions {
  const g = P.revenue > 0 ? ((A.revenue - P.revenue) / P.revenue) * 100 : 8;
  return {
    growthPct: Math.round(clamp(g, -10, 25)),
    gmShiftPts: 0, dsoDelta: 0, dioDelta: 0, dpoDelta: 0,
    opexInflationPct: 6, capexMonthly: 0, repayMonthly: 0, newBorrowing: 0, bufferDays: 15,
  };
}

export function runForecast(A: DerivedMetrics, a: Assumptions, start = new Date()): ForecastResult {
  const monthRev0 = A.revenue / 12;
  const cogsPct = A.revenue ? clamp(A.cogs / A.revenue - a.gmShiftPts / 100, 0, 1.5) : 0;
  // Days on a monthly basis: AR = monthlyRevenue × days / D  =>  days = AR / monthlyRevenue × D
  const dsoBase = monthRev0 ? (A.receivables / monthRev0) * D : 0;
  const monthCogs0 = A.cogs / 12;
  const dioBase = monthCogs0 > 0 ? (A.inventories / monthCogs0) * D : 0;
  const dpoBase = monthCogs0 > 0 ? (A.tradePayables / monthCogs0) * D : 0;

  const opexBase = (A.directExpenses + A.otherExpenses) / 12;
  const effTax = A.pbt > 0 ? clamp(A.tax / A.pbt, 0, 0.35) : 0.25;
  const buffer = ((A.cogs + A.directExpenses + A.otherExpenses) / 365) * a.bufferDays;

  let cash = A.cash, ar = A.receivables, inv = A.inventories, ap = A.tradePayables;
  let debt = A.totalDebt;
  const rows: MonthRow[] = [];
  const pbtByMonth: number[] = [];
  let ebitdaSum = 0;

  for (let m = 1; m <= 12; m++) {
    const d = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const label = d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
    const phase = Math.min(1, m / 6);
    const rev = monthRev0 * Math.pow(1 + a.growthPct / 100, m / 12);
    const cogs = rev * cogsPct;
    const opex = opexBase * Math.pow(1 + a.opexInflationPct / 100, m / 12);
    const otherInc = A.otherIncome / 12;

    const arNew = (rev * Math.max(0, dsoBase + a.dsoDelta * phase)) / D;
    const invNew = (cogs * Math.max(0, dioBase + a.dioDelta * phase)) / D;
    const apNew = (cogs * Math.max(0, dpoBase + a.dpoDelta * phase)) / D;
    const collections = rev + ar - arNew;
    const purchases = cogs + (invNew - inv);
    const suppliers = purchases + ap - apNew;

    const interest = A.totalDebt > 0 ? (A.financeCost / 12) * (debt / A.totalDebt) : A.financeCost / 12;
    const borrow = m === 1 ? a.newBorrowing : 0;
    const repay = Math.min(a.repayMonthly, Math.max(0, debt + borrow));
    debt = debt + borrow - repay;

    const pbt = rev - cogs - opex - interest - A.depreciation + otherInc;
    pbtByMonth.push(pbt);
    ebitdaSum += rev - cogs - opex + otherInc;

    rows.push({ label, revenue: rev, collections, otherIncome: otherInc, suppliers, opex, interest, tax: 0, capex: a.capexMonthly,
      loan: borrow - repay, net: 0, closing: 0, ar: arNew, inv: invNew, ap: apNew });
    ar = arNew; inv = invNew; ap = apNew;
  }

  // Tax: estimated for the year, paid in four equal instalments (months 3, 6, 9, 12).
  const annualPbt = pbtByMonth.reduce((s, x) => s + x, 0);
  const annualTax = Math.max(0, annualPbt) * effTax;
  [2, 5, 8, 11].forEach((i) => { rows[i].tax = annualTax / 4; });

  for (const r of rows) {
    r.net = r.collections + r.otherIncome - r.suppliers - r.opex - r.interest - r.tax - r.capex + r.loan;
    cash += r.net;
    r.closing = cash;
  }
  let minIndex = 0;
  rows.forEach((r, i) => { if (r.closing < rows[minIndex].closing) minIndex = i; });
  const breach = rows.find((r) => r.closing < buffer);
  const minCash = rows[minIndex].closing;
  return {
    rows, opening: A.cash, buffer, minCash, minMonth: rows[minIndex].label, minIndex, endCash: rows[11].closing,
    firstBreach: breach ? breach.label : null, fundingNeed: Math.max(0, buffer - minCash), ebitda: ebitdaSum, pbt: annualPbt,
  };
}

export interface Scenario { key: string; name: string; note: string; a: Assumptions }

export function buildScenarios(A: DerivedMetrics, base: Assumptions): Scenario[] {
  const dso = A.debtorDays, dio = A.inventoryDays;
  return [
    { key: 'base', name: 'Base', note: 'Your assumptions as set above.', a: base },
    { key: 'down', name: 'Downside', note: 'Sales growth 15 pts lower, margin 2 pts lower, customers pay 15 days later, stock builds by 10 days, suppliers paid 5 days sooner.',
      a: { ...base, growthPct: base.growthPct - 15, gmShiftPts: base.gmShiftPts - 2, dsoDelta: base.dsoDelta + 15, dioDelta: base.dioDelta + 10, dpoDelta: base.dpoDelta - 5 } },
    { key: 'up', name: 'Upside', note: 'Sales growth 8 pts higher, margin 1 pt higher, customers pay 10 days sooner, stock 10 days leaner.',
      a: { ...base, growthPct: base.growthPct + 8, gmShiftPts: base.gmShiftPts + 1, dsoDelta: base.dsoDelta - 10, dioDelta: base.dioDelta - 10 } },
    { key: 'wc', name: 'Working-capital discipline', note: `Receivable days brought to 90 and inventory days to 60 where above (benchmarks), suppliers paid 5 days later within terms. Sales and margin as Base.`,
      a: { ...base, dsoDelta: base.dsoDelta + Math.min(0, 90 - (dso + base.dsoDelta)), dioDelta: base.dioDelta + Math.min(0, 60 - (dio + base.dioDelta)), dpoDelta: base.dpoDelta + 5 } },
  ];
}
