import { StartupDataBundle } from './startupTypes';
import { capTableBaseCase, dataRoomStats } from './startupCompute';

export function buildStartupContext(companyName: string, bundle: StartupDataBundle): string {
  const { months, assumptions, capTable, dataRoom } = bundle;
  const m1 = months[0];
  const m9 = months[Math.min(8, months.length - 1)];
  const mLast = months[months.length - 1];
  const n = months.length;
  const base = capTableBaseCase(capTable);
  const dr = dataRoomStats(dataRoom);
  const maxBurn = Math.max(...months.map((m) => m.netBurn));
  const f = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

  return `You are a fractional CFO / fundraising advisor for ${companyName}, a startup. Base all answers ONLY on the following data (a ${n}-month forward operating model, all figures in INR). Do not invent numbers not derivable from this data.

Revenue: Month 1 MRR ${f(m1.mrr)} → Month ${n} MRR ${f(mLast.mrr)} (ARR ${f(mLast.arr)}). Gross margin assumption: ${assumptions.grossMarginPct.toFixed(0)}%.
Burn: Month 1 net burn ${f(m1.netBurn)}/mo, peaks around Month 9 at ${f(maxBurn)}/mo, Month ${n} net burn ${f(mLast.netBurn)}/mo.
Cash & Runway: Month 1 cash ${f(m1.cashBal + m1.netBurn)}, Month 1 runway ${m1.runway.toFixed(1)} months, Month ${n} cash balance ${f(mLast.cashBal)} with ${mLast.runway.toFixed(1)} months runway remaining at that point.
Burn multiple: Month 2 ${months[1]?.burnMultiple?.toFixed(2) ?? 'N/A'}x, Month ${n} ${mLast.burnMultiple?.toFixed(2) ?? 'N/A'}x (lower is more efficient; <1x is considered excellent).
Customers: Month 1 ending customers ${Math.round(m1.endingCust)}, Month ${n} ending customers ${Math.round(mLast.endingCust)}. Monthly churn ${assumptions.monthlyChurnRatePct.toFixed(2)}% (~${assumptions.avgLifetimeMonths}-month avg lifetime).
Unit economics: CAC ${f(m1.cac)}. LTV:CAC is ${m1.ltvCac.toFixed(1)}x in Month 1 (often an early-sample artifact) settling toward ${mLast.ltvCac.toFixed(1)}x by Month ${n} (benchmark: ≥3x is healthy).
Cap table: ${capTable.existingFdShares.toLocaleString()} existing fully-diluted shares (${capTable.existingCommon.toLocaleString()} common + ${capTable.existingOptionPool.toLocaleString()} option pool). Base-case target round: ${f(capTable.baseRaise)} raise at ${f(capTable.basePremoney)} pre-money (${f(base.postmoney)} post-money), giving new investors ${(base.newInvestorOwnership * 100).toFixed(1)}% ownership.
Data room readiness: ${dr.ready} of ${dr.total} documents Ready, ${dr.inProgress} In Progress, ${dr.notStarted} Not Started.

IMPORTANT: No live connection exists to any government portal — startup funding scheme information (Startup India, SISFS, 80-IAC, etc.), if discussed, is general knowledge only and must be verified on official portals before acting. Receivables aren't separately modeled here (typical for upfront-billed subscription revenue) unless the user says otherwise.`;
}
