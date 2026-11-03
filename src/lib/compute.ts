import { FinancialLineItems, DerivedMetrics, HealthScore, Alert } from './types';

export function derive(y: FinancialLineItems): DerivedMetrics {
  const ncl = y.securedLoans + y.unsecuredLoans + (y.deferredTaxLiab || 0);
  const cl = y.stBorrowings + y.tradePayables + y.otherCL + y.stProvisions;
  const ca = y.inventories + y.receivables + y.cash + y.otherCA;
  const nonCA = y.ppe + y.investments;
  const totalAssets = ca + nonCA;
  const grossProfit = y.revenue - (y.purchases + y.changeInInventories);
  const ebitda = y.pbt + y.financeCost + y.depreciation;
  const ebit = y.pbt + y.financeCost;
  const totalDebt = y.securedLoans + y.unsecuredLoans + y.stBorrowings;
  const netWorth = y.ownersCapital;
  const workingCapital = ca - cl;
  const cogs = y.purchases + y.changeInInventories;
  const debtorDays = y.revenue ? (y.receivables / y.revenue) * 365 : 0;
  const creditorDays = y.purchases ? (y.tradePayables / y.purchases) * 365 : 0;
  const inventoryDays = cogs ? (y.inventories / cogs) * 365 : 0;
  const ccc = debtorDays + inventoryDays - creditorDays;
  const currentRatio = cl ? ca / cl : 0;
  const quickRatio = cl ? (ca - y.inventories) / cl : 0;
  const wcRatio = ca ? workingCapital / ca : 0;
  const debtEquity = netWorth ? totalDebt / netWorth : 0;
  const debtEbitda = ebitda ? totalDebt / ebitda : 0;
  const interestCoverage = y.financeCost ? ebit / y.financeCost : 0;
  const grossMargin = y.revenue ? (grossProfit / y.revenue) * 100 : 0;
  const ebitdaMargin = y.revenue ? (ebitda / y.revenue) * 100 : 0;
  const ebitMargin = y.revenue ? (ebit / y.revenue) * 100 : 0;
  const netMargin = y.revenue ? (y.pat / y.revenue) * 100 : 0;
  const capitalEmployed = netWorth + totalDebt;
  const roce = capitalEmployed ? (ebit / capitalEmployed) * 100 : 0;
  const roa = totalAssets ? (y.pat / totalAssets) * 100 : 0;
  const assetTurnover = totalAssets ? y.revenue / totalAssets : 0;
  const debtorTurnover = y.receivables ? y.revenue / y.receivables : 0;
  const creditorTurnover = y.tradePayables ? y.purchases / y.tradePayables : 0;
  const inventoryTurnover = y.inventories ? cogs / y.inventories : 0;

  return {
    ...y, ncl, cl, ca, nonCA, totalAssets, grossProfit, ebitda, ebit, totalDebt, netWorth,
    workingCapital, cogs, debtorDays, creditorDays, inventoryDays, ccc, currentRatio, quickRatio,
    wcRatio, debtEquity, debtEbitda, interestCoverage, grossMargin, ebitdaMargin, ebitMargin,
    netMargin, capitalEmployed, roce, roa, assetTurnover, debtorTurnover, creditorTurnover,
    inventoryTurnover,
  };
}

export function pctChange(curr: number, prev: number): number | null {
  return prev === 0 ? null : ((curr - prev) / Math.abs(prev)) * 100;
}

export function pctF(curr: number, prev: number, decimals = 1): string {
  const v = pctChange(curr, prev);
  return v === null ? 'N/A' : (v >= 0 ? '+' : '') + v.toFixed(decimals);
}

export function formatINR(v: number, decimals = 2): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(decimals)} Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(decimals)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN')}`;
}

export function computeHealthScore(A: DerivedMetrics, P: DerivedMetrics): HealthScore {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

  const liqCurrent = clamp((A.currentRatio / 1.33) * 14, 0, 14);
  const liqQuick = clamp((A.quickRatio / 1) * 6, 0, 6);
  const liquidity = liqCurrent + liqQuick;

  const deScore = A.debtEquity <= 1 ? 10 : A.debtEquity <= 2 ? 8 : A.debtEquity <= 3 ? 5 : A.debtEquity <= 4 ? 3 : 1;
  const icScore = A.interestCoverage >= 3 ? 10 : A.interestCoverage >= 2 ? 7 : A.interestCoverage >= 1.5 ? 5 : A.interestCoverage >= 1 ? 3 : 0;
  const solvency = deScore + icScore;

  const nmScore = A.netMargin >= 10 ? 7 : A.netMargin >= 5 ? 5 : A.netMargin >= 2 ? 3 : A.netMargin >= 0 ? 1 : 0;
  const emScore = A.ebitdaMargin >= 15 ? 7 : A.ebitdaMargin >= 10 ? 5 : A.ebitdaMargin >= 5 ? 3 : A.ebitdaMargin >= 0 ? 1 : 0;
  const rcScore = A.roce >= 20 ? 6 : A.roce >= 15 ? 5 : A.roce >= 10 ? 3 : A.roce >= 5 ? 1 : 0;
  const profitability = nmScore + emScore + rcScore;

  const cccScore = A.ccc <= 30 ? 10 : A.ccc <= 60 ? 8 : A.ccc <= 90 ? 6 : A.ccc <= 120 ? 4 : A.ccc <= 180 ? 2 : 0;
  const atScore = A.assetTurnover >= 2 ? 10 : A.assetTurnover >= 1.5 ? 8 : A.assetTurnover >= 1 ? 6 : A.assetTurnover >= 0.5 ? 3 : 0;
  const efficiency = cccScore + atScore;

  const revG = pctChange(A.revenue, P.revenue);
  const rgScore = revG === null ? 0 : revG >= 20 ? 8 : revG >= 10 ? 6 : revG >= 0 ? 4 : 0;
  const marginTrendScore = A.ebitdaMargin > P.ebitdaMargin ? 6 : 0;
  const leverageTrendScore = A.debtEquity < P.debtEquity ? 6 : 0;
  const growth = rgScore + marginTrendScore + leverageTrendScore;

  const total = liquidity + solvency + profitability + efficiency + growth;
  const band =
    total >= 80 ? { label: 'Strong', cls: 'good' as const } :
    total >= 65 ? { label: 'Healthy', cls: 'good' as const } :
    total >= 50 ? { label: 'Moderate', cls: 'watch' as const } :
    total >= 35 ? { label: 'Weak', cls: 'watch' as const } :
    { label: 'Critical', cls: 'critical' as const };

  return {
    total, band,
    breakdown: [
      { label: 'Liquidity', score: liquidity, max: 20 },
      { label: 'Solvency', score: solvency, max: 20 },
      { label: 'Profitability', score: profitability, max: 20 },
      { label: 'Efficiency', score: efficiency, max: 20 },
      { label: 'Growth & Trend', score: growth, max: 20 },
    ],
  };
}

// MSME classification (Udyam composite criteria, effective 1 Apr 2025).
export function computeMsmeClassification(investment: number, turnover: number) {
  let category: string;
  if (investment <= 25000000 && turnover <= 100000000) category = 'Micro';
  else if (investment <= 250000000 && turnover <= 1000000000) category = 'Small';
  else if (investment <= 1250000000 && turnover <= 5000000000) category = 'Medium';
  else category = 'Above MSME threshold';
  return { investment, turnover, category };
}

export function computeAlerts(A: DerivedMetrics, P: DerivedMetrics): Alert[] {
  const alerts: Alert[] = [];
  const fmt = (v: number) => formatINR(v);

  if (A.cash < A.revenue * 0.01) {
    alerts.push({ level: 'critical', title: 'Cash buffer is very thin', text: `Cash & bank stood at just ${fmt(A.cash)} at year-end against ${fmt(A.revenue)} in annual revenue.` });
  }
  if (A.currentRatio < 1.2) {
    alerts.push({ level: 'watch', title: 'Current ratio close to 1.0', text: `Current ratio is ${A.currentRatio.toFixed(2)}x (vs ${P.currentRatio.toFixed(2)}x last year). Quick ratio is ${A.quickRatio.toFixed(2)}x.` });
  }
  if (A.ebitdaMargin > P.ebitdaMargin) {
    alerts.push({ level: 'good', title: 'EBITDA margin improved', text: `EBITDA margin rose from ${P.ebitdaMargin.toFixed(2)}% to ${A.ebitdaMargin.toFixed(2)}%.` });
  } else if (A.ebitdaMargin < P.ebitdaMargin) {
    alerts.push({ level: 'watch', title: 'EBITDA margin declined', text: `EBITDA margin fell from ${P.ebitdaMargin.toFixed(2)}% to ${A.ebitdaMargin.toFixed(2)}%.` });
  }
  if (A.debtorDays < P.debtorDays) {
    alerts.push({ level: 'good', title: 'Collections got faster', text: `Debtor days improved from ${P.debtorDays.toFixed(0)} to ${A.debtorDays.toFixed(0)} days.` });
  } else if (A.debtorDays > P.debtorDays) {
    alerts.push({ level: 'watch', title: 'Collections slowed down', text: `Debtor days rose from ${P.debtorDays.toFixed(0)} to ${A.debtorDays.toFixed(0)} days.` });
  }
  if (A.debtEquity < P.debtEquity) {
    alerts.push({ level: 'good', title: 'Leverage improved', text: `Debt-to-equity fell from ${P.debtEquity.toFixed(2)}x to ${A.debtEquity.toFixed(2)}x.` });
  } else if (A.debtEquity > P.debtEquity) {
    alerts.push({ level: 'watch', title: 'Leverage increased', text: `Debt-to-equity rose from ${P.debtEquity.toFixed(2)}x to ${A.debtEquity.toFixed(2)}x.` });
  }
  if (A.interestCoverage > P.interestCoverage) {
    alerts.push({ level: 'good', title: 'Interest coverage strengthened', text: `EBIT covers finance cost ${A.interestCoverage.toFixed(2)}x, up from ${P.interestCoverage.toFixed(2)}x.` });
  } else if (A.interestCoverage < P.interestCoverage) {
    alerts.push({ level: 'critical', title: 'Interest coverage weakened', text: `EBIT covers finance cost only ${A.interestCoverage.toFixed(2)}x, down from ${P.interestCoverage.toFixed(2)}x.` });
  }
  return alerts;
}

/* ================= Overview KPI list ================= */
export interface KpiDef { key: string; label: string; unit: 'currency' | 'percent' | 'days' | 'ratio'; goodIfUp: boolean; }
export const OVERVIEW_KPIS: KpiDef[] = [
  { key: 'revenue', label: 'Revenue', unit: 'currency', goodIfUp: true },
  { key: 'grossProfit', label: 'Gross Profit', unit: 'currency', goodIfUp: true },
  { key: 'grossMargin', label: 'Gross Margin %', unit: 'percent', goodIfUp: true },
  { key: 'ebitda', label: 'EBITDA', unit: 'currency', goodIfUp: true },
  { key: 'ebitdaMargin', label: 'EBITDA Margin %', unit: 'percent', goodIfUp: true },
  { key: 'pat', label: 'Net Profit', unit: 'currency', goodIfUp: true },
  { key: 'netMargin', label: 'Net Profit Margin %', unit: 'percent', goodIfUp: true },
  { key: 'cash', label: 'Cash & Bank Balance', unit: 'currency', goodIfUp: true },
  { key: 'receivables', label: 'Total Receivables', unit: 'currency', goodIfUp: false },
  { key: 'tradePayables', label: 'Total Payables', unit: 'currency', goodIfUp: false },
  { key: 'workingCapital', label: 'Net Working Capital', unit: 'currency', goodIfUp: true },
  { key: 'debtorDays', label: 'Debtor Days', unit: 'days', goodIfUp: false },
  { key: 'creditorDays', label: 'Creditor Days', unit: 'days', goodIfUp: true },
  { key: 'inventoryDays', label: 'Inventory Days', unit: 'days', goodIfUp: false },
  { key: 'ccc', label: 'Cash Conversion Cycle', unit: 'days', goodIfUp: false },
  { key: 'totalDebt', label: 'Debt', unit: 'currency', goodIfUp: false },
  { key: 'netWorth', label: 'Net Worth', unit: 'currency', goodIfUp: true },
];
export function fmtByUnit(v: number, unit: KpiDef['unit']): string {
  if (unit === 'currency') return formatINR(v);
  if (unit === 'percent') return `${v.toFixed(2)}%`;
  if (unit === 'days') return `${v.toFixed(0)} days`;
  return `${v.toFixed(2)}x`;
}

export function varianceExplain(key: string, A: DerivedMetrics, P: DerivedMetrics): string {
  switch (key) {
    case 'revenue':
      return `Revenue moved from ${formatINR(P.revenue)} to ${formatINR(A.revenue)} (${pctF(A.revenue, P.revenue)}%). Product/customer-level drivers aren't available from summary financials alone.`;
    case 'grossProfit':
    case 'grossMargin':
      return `Gross profit = Revenue − (Purchases/Cost of materials + inventory movement). Revenue moved ${pctF(A.revenue, P.revenue)}%, while cost of materials + inventory movement moved ${pctF(A.purchases + A.changeInInventories, P.purchases + P.changeInInventories)}%.`;
    case 'ebitda':
    case 'ebitdaMargin':
      return `EBITDA moved from ${formatINR(P.ebitda)} to ${formatINR(A.ebitda)}. Revenue moved ${pctF(A.revenue, P.revenue)}%, cost of materials + inventory movement moved ${pctF(A.purchases + A.changeInInventories, P.purchases + P.changeInInventories)}%, other operating expenses moved ${pctF(A.otherExpenses, P.otherExpenses)}%.`;
    case 'pat':
    case 'netMargin':
      return `Net profit moved from ${formatINR(P.pat)} to ${formatINR(A.pat)}. EBITDA moved ${pctF(A.ebitda, P.ebitda)}%, finance cost moved ${pctF(A.financeCost, P.financeCost)}%, depreciation moved ${pctF(A.depreciation, P.depreciation)}%.`;
    case 'cash':
      return `Cash & bank moved from ${formatINR(P.cash)} to ${formatINR(A.cash)}. This is a balance-sheet snapshot only.`;
    case 'receivables':
      return `Receivables moved from ${formatINR(P.receivables)} to ${formatINR(A.receivables)} (${pctF(A.receivables, P.receivables)}%) while revenue moved ${pctF(A.revenue, P.revenue)}% and debtor days moved from ${P.debtorDays.toFixed(0)} to ${A.debtorDays.toFixed(0)} days.`;
    case 'tradePayables':
      return `Payables moved from ${formatINR(P.tradePayables)} to ${formatINR(A.tradePayables)} (${pctF(A.tradePayables, P.tradePayables)}%) while purchases moved ${pctF(A.purchases, P.purchases)}% and creditor days moved from ${P.creditorDays.toFixed(0)} to ${A.creditorDays.toFixed(0)} days.`;
    case 'workingCapital':
      return `Net working capital moved from ${formatINR(P.workingCapital)} to ${formatINR(A.workingCapital)}, driven by current assets moving ${pctF(A.ca, P.ca)}% against current liabilities moving ${pctF(A.cl, P.cl)}%.`;
    case 'debtorDays':
      return `Debtor days moved from ${P.debtorDays.toFixed(0)} to ${A.debtorDays.toFixed(0)}.`;
    case 'creditorDays':
      return `Creditor days moved from ${P.creditorDays.toFixed(0)} to ${A.creditorDays.toFixed(0)}.`;
    case 'inventoryDays':
      return `Inventory days moved from ${P.inventoryDays.toFixed(0)} to ${A.inventoryDays.toFixed(0)}.`;
    case 'ccc':
      return `Cash conversion cycle moved from ${P.ccc.toFixed(0)} to ${A.ccc.toFixed(0)} days.`;
    case 'totalDebt':
      return `Total debt moved from ${formatINR(P.totalDebt)} to ${formatINR(A.totalDebt)}.`;
    case 'netWorth':
      return `Net worth moved from ${formatINR(P.netWorth)} to ${formatINR(A.netWorth)}.`;
    default:
      return 'This figure moved significantly period-on-period.';
  }
}

/* ================= Expense Intelligence ================= */
export interface ExpenseLine { label: string; current: number; previous: number; }
export function expenseBreakdown(A: DerivedMetrics, P: DerivedMetrics): ExpenseLine[] {
  return [
    { label: 'Cost of Materials / Purchases', current: A.purchases, previous: P.purchases },
    { label: 'Employee / Direct Expenses', current: A.directExpenses, previous: P.directExpenses },
    { label: 'Change in Inventories', current: A.changeInInventories, previous: P.changeInInventories },
    { label: 'Depreciation & Amortisation', current: A.depreciation, previous: P.depreciation },
    { label: 'Finance Cost', current: A.financeCost, previous: P.financeCost },
    { label: 'Other Expenses', current: A.otherExpenses, previous: P.otherExpenses },
  ];
}
export function expenseVarianceExplain(line: ExpenseLine, A: DerivedMetrics, P: DerivedMetrics): string {
  const growth = pctChange(line.current, line.previous);
  const revGrowth = pctChange(A.revenue, P.revenue);
  const growthStr = growth === null ? 'N/A' : (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%';
  const revGrowthStr = revGrowth === null ? 'N/A' : (revGrowth >= 0 ? '+' : '') + revGrowth.toFixed(1) + '%';
  return `${line.label} moved from ${formatINR(line.previous)} to ${formatINR(line.current)} (${growthStr}), now ${A.revenue ? ((line.current / A.revenue) * 100).toFixed(1) : '0'}% of revenue — revenue itself moved ${revGrowthStr} over the same period.`;
}

/* ================= Ratio categorization ================= */
export interface RatioDef { label: string; current: number; previous: number; unit: 'x' | '%' | 'd'; goodIfUp: boolean; }
export interface RatioCategory { category: string; ratios: RatioDef[]; }
export function categorizedRatios(A: DerivedMetrics, P: DerivedMetrics): RatioCategory[] {
  return [
    { category: 'Liquidity', ratios: [
      { label: 'Current Ratio', current: A.currentRatio, previous: P.currentRatio, unit: 'x', goodIfUp: true },
      { label: 'Quick Ratio', current: A.quickRatio, previous: P.quickRatio, unit: 'x', goodIfUp: true },
      { label: 'Working Capital Ratio', current: A.wcRatio * 100, previous: P.wcRatio * 100, unit: '%', goodIfUp: true },
    ]},
    { category: 'Solvency', ratios: [
      { label: 'Debt-to-Equity', current: A.debtEquity, previous: P.debtEquity, unit: 'x', goodIfUp: false },
      { label: 'Debt-to-EBITDA', current: A.debtEbitda, previous: P.debtEbitda, unit: 'x', goodIfUp: false },
      { label: 'Interest Coverage', current: A.interestCoverage, previous: P.interestCoverage, unit: 'x', goodIfUp: true },
    ]},
    { category: 'Profitability', ratios: [
      { label: 'Gross Margin', current: A.grossMargin, previous: P.grossMargin, unit: '%', goodIfUp: true },
      { label: 'EBITDA Margin', current: A.ebitdaMargin, previous: P.ebitdaMargin, unit: '%', goodIfUp: true },
      { label: 'EBIT Margin', current: A.ebitMargin, previous: P.ebitMargin, unit: '%', goodIfUp: true },
      { label: 'Net Profit Margin', current: A.netMargin, previous: P.netMargin, unit: '%', goodIfUp: true },
      { label: 'ROCE', current: A.roce, previous: P.roce, unit: '%', goodIfUp: true },
      { label: 'ROA', current: A.roa, previous: P.roa, unit: '%', goodIfUp: true },
    ]},
    { category: 'Efficiency', ratios: [
      { label: 'Debtor Turnover', current: A.debtorTurnover, previous: P.debtorTurnover, unit: 'x', goodIfUp: true },
      { label: 'Debtor Days', current: A.debtorDays, previous: P.debtorDays, unit: 'd', goodIfUp: false },
      { label: 'Creditor Turnover', current: A.creditorTurnover, previous: P.creditorTurnover, unit: 'x', goodIfUp: true },
      { label: 'Creditor Days', current: A.creditorDays, previous: P.creditorDays, unit: 'd', goodIfUp: true },
      { label: 'Inventory Turnover', current: A.inventoryTurnover, previous: P.inventoryTurnover, unit: 'x', goodIfUp: true },
      { label: 'Inventory Days', current: A.inventoryDays, previous: P.inventoryDays, unit: 'd', goodIfUp: false },
      { label: 'Asset Turnover', current: A.assetTurnover, previous: P.assetTurnover, unit: 'x', goodIfUp: true },
    ]},
  ];
}

/* ================= MSME & Funding ================= */
export const FUNDING_SCHEMES: { name: string; type: string; desc: string; link: string }[] = [
  { name: 'Udyam Registration', type: 'Central', desc: 'Free, self-declared registration on the Udyam portal — the prerequisite for essentially every MSME scheme, priority-sector lending, and government tender preference below.', link: 'https://udyamregistration.gov.in' },
  { name: 'CGTMSE — Credit Guarantee Fund Trust for MSEs', type: 'Central', desc: 'Enables collateral-free term loans and working capital, with a government trust guaranteeing a large share of the loan to the lender. Terms/ceilings change — confirm current details with your bank or on cgtmse.in. Applies to Micro/Small only, not Medium enterprises.', link: 'https://www.cgtmse.in' },
  { name: 'TReDS — Trade Receivables Discounting System', type: 'Central', desc: 'Lets you auction unpaid customer invoices to financiers/banks for early payment at a discount — a way to convert receivables into cash without new debt.', link: 'https://www.rxil.in' },
  { name: 'RAMP — Raising and Accelerating MSME Performance', type: 'Central', desc: 'World Bank-supported scheme for MSME handholding, quality certification, and market access support — mainly non-financial assistance.', link: 'https://msme.gov.in' },
  { name: 'MUDRA Loan (Shishu / Kishor / Tarun)', type: 'Central', desc: 'Collateral-free loans up to ₹20 lakh for small trading/service/manufacturing businesses, in three tiers by loan size.', link: 'https://www.mudra.org.in' },
  { name: 'State Investment Promotion Schemes', type: 'State', desc: "Most states run their own investment promotion policy (capital subsidy, SGST reimbursement, interest subsidy) — typically for new units or expansions, not routine working capital. Check your state's Department of Industries for the current scheme.", link: 'https://www.startupindia.gov.in' },
];

export function computeFundingGaps(A: DerivedMetrics): { metric: string; current: string; target: string; action: string }[] {
  return [
    { metric: 'Current Ratio', current: `${A.currentRatio.toFixed(2)}x`, target: '≥1.33x', action: A.currentRatio < 1.33 ? 'Build a cash buffer and reduce reliance on short-term borrowings — reducing inventory days is usually the fastest lever.' : 'Already within typical lender comfort range.' },
    { metric: 'Quick Ratio', current: `${A.quickRatio.toFixed(2)}x`, target: '≥1.0x', action: A.quickRatio < 1.0 ? 'Liquidity depends heavily on selling inventory rather than cash/receivables alone.' : 'Already within typical lender comfort range.' },
    { metric: 'Interest Coverage', current: `${A.interestCoverage.toFixed(2)}x`, target: '≥3x', action: A.interestCoverage < 3 ? 'Sustaining EBITDA growth would close the gap to the typical comfort threshold.' : 'Already within typical lender comfort range.' },
    { metric: 'Debt-to-Equity', current: `${A.debtEquity.toFixed(2)}x`, target: '≤2x', action: A.debtEquity > 2 ? 'Elevated — consider equity infusion or debt paydown before seeking more term debt.' : 'Not currently a constraint on further borrowing.' },
    { metric: 'Cash & Bank Buffer', current: formatINR(A.cash), target: '~15-30 days of operating expenses', action: `At the current cost run-rate (~${formatINR(A.totalExpenses / 365)}/day), a 15-day buffer would be roughly ${formatINR((A.totalExpenses / 365) * 15)}.` },
    { metric: 'Inventory Days', current: `${A.inventoryDays.toFixed(0)} days`, target: 'Lower is better — sector dependent', action: `Cutting inventory days by 30 would release roughly ${formatINR((A.cogs / 365) * 30)} in cash without new borrowing.` },
  ];
}
