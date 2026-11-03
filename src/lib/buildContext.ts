import { DerivedMetrics, HealthScore, Alert } from './types';
import { formatINR } from './compute';

export function buildContext(
  companyName: string,
  currentLabel: string,
  previousLabel: string,
  A: DerivedMetrics,
  P: DerivedMetrics,
  health: HealthScore,
  msmeCategory: string,
  alerts: Alert[]
): string {
  const f = (v: number) => `₹${v.toLocaleString('en-IN')}`;
  return `You are a CFO analytics agent for ${companyName}. Base all answers ONLY on the following verified financial data. Do not invent numbers not derivable from this data. If something requires ledger-level, customer-level, monthly, or forecast data not present here, say so plainly rather than guessing.

${currentLabel} = current period. ${previousLabel} = previous period.

P&L:
Revenue: ${currentLabel} ${f(A.revenue)} | ${previousLabel} ${f(P.revenue)}
Gross Profit: ${currentLabel} ${f(A.grossProfit)} (${A.grossMargin.toFixed(2)}%) | ${previousLabel} ${f(P.grossProfit)} (${P.grossMargin.toFixed(2)}%)
EBITDA: ${currentLabel} ${f(A.ebitda)} (${A.ebitdaMargin.toFixed(2)}%) | ${previousLabel} ${f(P.ebitda)} (${P.ebitdaMargin.toFixed(2)}%)
Net Profit: ${currentLabel} ${f(A.pat)} (${A.netMargin.toFixed(2)}%) | ${previousLabel} ${f(P.pat)} (${P.netMargin.toFixed(2)}%)

Balance Sheet:
Net Worth: ${currentLabel} ${f(A.netWorth)} | ${previousLabel} ${f(P.netWorth)}
Total Debt: ${currentLabel} ${f(A.totalDebt)} | ${previousLabel} ${f(P.totalDebt)}
Trade Receivables: ${currentLabel} ${f(A.receivables)} | ${previousLabel} ${f(P.receivables)}
Trade Payables: ${currentLabel} ${f(A.tradePayables)} | ${previousLabel} ${f(P.tradePayables)}
Inventory: ${currentLabel} ${f(A.inventories)} | ${previousLabel} ${f(P.inventories)}
Cash & Bank: ${currentLabel} ${f(A.cash)} | ${previousLabel} ${f(P.cash)}
Net Working Capital: ${currentLabel} ${f(A.workingCapital)} | ${previousLabel} ${f(P.workingCapital)}

Key Ratios (${currentLabel} | ${previousLabel}):
Current Ratio: ${A.currentRatio.toFixed(2)}x | ${P.currentRatio.toFixed(2)}x
Debt-to-Equity: ${A.debtEquity.toFixed(2)}x | ${P.debtEquity.toFixed(2)}x
Interest Coverage: ${A.interestCoverage.toFixed(2)}x | ${P.interestCoverage.toFixed(2)}x
Debtor Days: ${A.debtorDays.toFixed(0)} | ${P.debtorDays.toFixed(0)}
Creditor Days: ${A.creditorDays.toFixed(0)} | ${P.creditorDays.toFixed(0)}
Inventory Days: ${A.inventoryDays.toFixed(0)} | ${P.inventoryDays.toFixed(0)}
Cash Conversion Cycle: ${A.ccc.toFixed(0)} | ${P.ccc.toFixed(0)}

Business Health Score: ${health.total.toFixed(0)}/100 — ${health.band.label} (rule-based composite, not a formal credit rating).
Likely MSME classification (Udyam composite criteria, subject to eligibility verification): ${msmeCategory}.

Current Alerts:
${alerts.map((a) => `- [${a.level}] ${a.title}: ${a.text}`).join('\n')}

IMPORTANT: No live connection exists to any government portal — funding/subsidy information, if discussed, is general knowledge only and must be verified on official portals before acting. This is annual/period-level data — no monthly trend or forecast data is available unless separately noted.`;
}

/**
 * Pre-computes the growth-rate comparisons and ratio movements that a management summary
 * should be built on. Doing this in code rather than asking the model to derive it means the
 * percentages are always arithmetically correct — the model only has to interpret them.
 */
export function buildVarianceContext(
  currentLabel: string,
  previousLabel: string,
  A: DerivedMetrics,
  P: DerivedMetrics
): string {
  const pc = (c: number, p: number) => (p === 0 ? null : ((c - p) / Math.abs(p)) * 100);
  const s = (v: number | null, d = 1) => (v === null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`);
  const pts = (c: number, p: number, d = 2) => `${c - p >= 0 ? '+' : ''}${(c - p).toFixed(d)} pts`;

  const revG = pc(A.revenue, P.revenue);
  const recG = pc(A.receivables, P.receivables);
  const invG = pc(A.inventories, P.inventories);
  const payG = pc(A.tradePayables, P.tradePayables);
  const patG = pc(A.pat, P.pat);
  const ebitdaG = pc(A.ebitda, P.ebitda);
  const cogsG = pc(A.cogs, P.cogs);
  const opexG = pc(A.otherExpenses + A.directExpenses, P.otherExpenses + P.directExpenses);
  const finG = pc(A.financeCost, P.financeCost);
  const debtG = pc(A.totalDebt, P.totalDebt);

  // The comparisons that actually matter — each one is a potential headline.
  const lines: string[] = [];
  if (revG !== null && recG !== null) {
    const gap = recG - revG;
    lines.push(
      `Receivables grew ${s(recG)} vs revenue ${s(revG)} — a gap of ${gap >= 0 ? '+' : ''}${gap.toFixed(1)} pts. ${
        gap > 10
          ? 'Receivables are outgrowing sales, so growth is being funded by slower collection, not cash.'
          : gap < -10
          ? 'Collections improved relative to sales — growth converted to cash better than last year.'
          : 'Broadly in line with sales growth.'
      }`
    );
  }
  if (revG !== null && invG !== null) {
    const gap = invG - revG;
    lines.push(
      `Inventory grew ${s(invG)} vs revenue ${s(revG)} — a gap of ${gap >= 0 ? '+' : ''}${gap.toFixed(1)} pts. ${
        gap > 10 ? 'Stock is building faster than sales, absorbing cash.' : 'Stock growth is proportionate to sales.'
      }`
    );
  }
  if (revG !== null && cogsG !== null) {
    lines.push(
      `Cost of goods grew ${s(cogsG)} vs revenue ${s(revG)} — ${
        (cogsG ?? 0) > (revG ?? 0)
          ? 'input costs rose faster than sales, compressing gross margin.'
          : 'sales outpaced input costs, supporting gross margin.'
      }`
    );
  }
  if (revG !== null && opexG !== null) {
    lines.push(`Operating expenses grew ${s(opexG)} vs revenue ${s(revG)} — ${(opexG ?? 0) > (revG ?? 0) ? 'overheads scaling faster than sales.' : 'operating leverage working in the company\u2019s favour.'}`);
  }
  if (finG !== null && debtG !== null) {
    lines.push(`Finance cost moved ${s(finG)} while total debt moved ${s(debtG)}.`);
  }

  return `
=== PRE-COMPUTED VARIANCE ANALYSIS (${currentLabel} vs ${previousLabel}) ===
These percentages are already calculated correctly — use them directly, do not recalculate.

GROWTH RATES:
Revenue ${s(revG)} | EBITDA ${s(ebitdaG)} | Net profit ${s(patG)}
Receivables ${s(recG)} | Inventory ${s(invG)} | Payables ${s(payG)}
Cost of goods ${s(cogsG)} | Operating expenses ${s(opexG)} | Finance cost ${s(finG)} | Total debt ${s(debtG)}

MARGIN MOVEMENT (percentage points):
Gross margin ${A.grossMargin.toFixed(2)}% vs ${P.grossMargin.toFixed(2)}% (${pts(A.grossMargin, P.grossMargin)})
EBITDA margin ${A.ebitdaMargin.toFixed(2)}% vs ${P.ebitdaMargin.toFixed(2)}% (${pts(A.ebitdaMargin, P.ebitdaMargin)})
Net margin ${A.netMargin.toFixed(2)}% vs ${P.netMargin.toFixed(2)}% (${pts(A.netMargin, P.netMargin)})

WORKING CAPITAL DAYS (benchmark in brackets):
Debtor days ${A.debtorDays.toFixed(0)} vs ${P.debtorDays.toFixed(0)} (benchmark 90) — ${(A.debtorDays - P.debtorDays >= 0 ? '+' : '')}${(A.debtorDays - P.debtorDays).toFixed(0)} days
Inventory days ${A.inventoryDays.toFixed(0)} vs ${P.inventoryDays.toFixed(0)} (benchmark 60) — ${(A.inventoryDays - P.inventoryDays >= 0 ? '+' : '')}${(A.inventoryDays - P.inventoryDays).toFixed(0)} days
Creditor days ${A.creditorDays.toFixed(0)} vs ${P.creditorDays.toFixed(0)} — ${(A.creditorDays - P.creditorDays >= 0 ? '+' : '')}${(A.creditorDays - P.creditorDays).toFixed(0)} days
Cash conversion cycle ${A.ccc.toFixed(0)} vs ${P.ccc.toFixed(0)} days — ${(A.ccc - P.ccc >= 0 ? '+' : '')}${(A.ccc - P.ccc).toFixed(0)} days

KEY RATIOS (reference level in brackets):
Current ratio ${A.currentRatio.toFixed(2)}x vs ${P.currentRatio.toFixed(2)}x (ref 1.33x)
Quick ratio ${A.quickRatio.toFixed(2)}x vs ${P.quickRatio.toFixed(2)}x (ref 1.00x)
Debt-to-equity ${A.debtEquity.toFixed(2)}x vs ${P.debtEquity.toFixed(2)}x (ref max 2.00x — lower is better)
Interest coverage ${A.interestCoverage.toFixed(2)}x vs ${P.interestCoverage.toFixed(2)}x (ref min 3.00x)
ROCE ${A.roce.toFixed(2)}% vs ${P.roce.toFixed(2)}%

CASH IMPACT OF WORKING CAPITAL (already computed):
Every 1 day of debtor days = ${formatINR(A.revenue / 365)} of cash
Every 1 day of inventory days = ${formatINR(A.cogs / 365)} of cash

RELATIONSHIPS WORTH LEADING WITH:
${lines.map((l) => `- ${l}`).join('\n')}
`;
}
