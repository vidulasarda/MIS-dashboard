import { DerivedMetrics } from './types';

export type FlagLevel = 'good' | 'watch' | 'critical';
export interface WcFlag {
  level: FlagLevel;
  label: string;
}

// ===== Benchmarks (flat, applied uniformly — see dashboard redesign spec §3) =====
export const TR_BENCHMARK_DAYS = 90;
export const TP_MSME_BENCHMARK_DAYS = 45; // statutory — MSMED Act Section 15/16
export const INVENTORY_BENCHMARK_DAYS = 60; // 2 months

/** Trade Receivables — lower is better. Bands are the exact numbers from the spec. */
export function trFlag(debtorDays: number): WcFlag {
  if (debtorDays < 80) return { level: 'good', label: 'Healthy' };
  if (debtorDays <= 90) return { level: 'watch', label: 'Attention' };
  return { level: 'critical', label: 'Critical' };
}

/** Inventory — lower is better, mirrors TR's 10-day buffer structure. */
export function inventoryFlag(inventoryDays: number): WcFlag {
  if (inventoryDays < 50) return { level: 'good', label: 'Healthy' };
  if (inventoryDays <= 60) return { level: 'watch', label: 'Attention' };
  return { level: 'critical', label: 'Critical' };
}

/** Trade Payables to MSME suppliers — higher is worse (statutory 45-day clock). */
export function tpMsmeFlag(creditorDaysToMsme: number): WcFlag {
  if (creditorDaysToMsme <= 45) return { level: 'good', label: 'Healthy (compliant)' };
  if (creditorDaysToMsme <= 60) return { level: 'watch', label: 'Attention (in breach)' };
  return { level: 'critical', label: 'Critical (in breach)' };
}

/** Trade Payables to non-MSME suppliers — REVERSED direction: longer is better, no upper ceiling.
 *  Also the fallback rule when an upload doesn't distinguish MSME from non-MSME creditors at all —
 *  absence of a disclosed MSME figure is not evidence of a compliance risk, so we don't assume one. */
export function tpNonMsmeFlag(creditorDays: number): WcFlag {
  if (creditorDays < 45) return { level: 'watch', label: 'Attention (paying unusually fast)' };
  return { level: 'good', label: 'Healthy' };
}

export interface TpFlagResult {
  overall: WcFlag;
  msme: (WcFlag & { days: number }) | null;
  nonMsme: (WcFlag & { days: number }) | null;
  hasSplit: boolean;
}

/** Combines the MSME and non-MSME sub-judgments into one headline flag. MSME always wins the
 *  rollup (a real compliance breach must never be hidden by a healthy non-MSME position) — but
 *  only when a split actually exists; otherwise the single non-MSME-style judgment is the answer. */
export function tpOverallFlag(
  totalCreditorDays: number,
  msmePayables: number | null,
  nonMsmePayables: number | null,
  purchases: number
): TpFlagResult {
  const hasSplit = msmePayables !== null && nonMsmePayables !== null && (msmePayables > 0 || nonMsmePayables > 0);

  if (!hasSplit) {
    const flag = tpNonMsmeFlag(totalCreditorDays);
    return { overall: flag, msme: null, nonMsme: { ...flag, days: totalCreditorDays }, hasSplit: false };
  }

  const msmeDays = purchases ? ((msmePayables ?? 0) / purchases) * 365 : 0;
  const nonMsmeDays = purchases ? ((nonMsmePayables ?? 0) / purchases) * 365 : 0;
  const msmeF = tpMsmeFlag(msmeDays);
  const nonMsmeF = tpNonMsmeFlag(nonMsmeDays);

  const severity: Record<FlagLevel, number> = { critical: 2, watch: 1, good: 0 };
  const overall = severity[msmeF.level] >= severity[nonMsmeF.level] ? msmeF : nonMsmeF;

  return {
    overall,
    msme: { ...msmeF, days: msmeDays },
    nonMsme: { ...nonMsmeF, days: nonMsmeDays },
    hasSplit: true,
  };
}

// ===== What-if scenario calculator (§4) =====
export interface ScenarioResult {
  cashUnlocked: number;
  financeCostSaved: number | null; // null = no short-term borrowings to offset
}

/** Cash-timing effect only — never implies a profit-and-loss impact unless finance cost is
 *  genuinely reduced by paying down short-term borrowings with the freed cash. */
function scenarioCash(daysChange: number, base: number): number {
  return (daysChange / 365) * base;
}

/** Cash-timing effect only — never implies a profit-and-loss impact unless finance cost is
 *  genuinely reduced by paying down short-term borrowings with the freed cash.
 *  Rate = total interest cost / total loans (secured + unsecured + short-term), per the balance
 *  sheet — NOT just short-term borrowings, which understates the denominator and produces an
 *  unrealistic implied rate (e.g. 30-40%) instead of a realistic blended rate (typically ~12-15%). */
function financeCostSaved(cashUnlocked: number, A: DerivedMetrics): number | null {
  if (!A.totalDebt || !A.financeCost) return null;
  const effectiveRate = A.financeCost / A.totalDebt;
  const payableDown = Math.min(cashUnlocked, A.stBorrowings); // can only pay down what's short-term/on-demand
  if (payableDown <= 0) return null;
  return payableDown * effectiveRate;
}

export function trScenario(daysReduction: number, A: DerivedMetrics): ScenarioResult {
  const cashUnlocked = scenarioCash(daysReduction, A.revenue);
  return { cashUnlocked, financeCostSaved: financeCostSaved(cashUnlocked, A) };
}

export function inventoryScenario(daysReduction: number, A: DerivedMetrics): ScenarioResult {
  const cashUnlocked = scenarioCash(daysReduction, A.cogs);
  return { cashUnlocked, financeCostSaved: financeCostSaved(cashUnlocked, A) };
}

/** TP: positive daysChange = paying slower (frees cash); negative = paying faster (uses cash).
 *  Non-MSME only — MSME payables have no "extend the days" lever, see msmeTaxDisallowance(). */
export function tpScenario(daysChange: number, A: DerivedMetrics): ScenarioResult {
  const cashUnlocked = scenarioCash(daysChange, A.purchases);
  return { cashUnlocked, financeCostSaved: financeCostSaved(cashUnlocked, A) };
}

// ===== MSME payment breach — income tax impact (Section 43B(h)) =====
// Replaces a "what if we extended MSME payment terms" slider, which doesn't make sense — the
// 45-day limit is a hard statutory ceiling, not a target to optimize against. What's actually at
// stake for late MSME payments is that the corresponding expense is disallowed as a deduction
// under Section 43B(h) of the Income Tax Act until the year it's actually paid.
export interface AgeingRow { name: string; amount: number; days: number; }
export function msmeBreachedRows(msmeRows: AgeingRow[]): AgeingRow[] {
  return msmeRows.filter((r) => r.days > 45).sort((a, b) => b.days - a.days);
}
export function msmeTaxImpact(breachedAmount: number, taxRatePct: number): number {
  return breachedAmount * (taxRatePct / 100);
}

// ===== Inventory: discard slow-moving stock, reinvest in fastest-turning item =====
export interface DiscardScenarioResult {
  cashRecovered: number;
  writeOff: number;
  incrementalRevenue: number;
  incrementalGrossProfit: number;
}
/** slowMovingValue = value of stock sitting beyond the ageing threshold (>90 days is the
 *  convention used elsewhere in this app). fastestItemDays = days-on-hand of the fastest-turning
 *  item in the company's inventory ageing upload. grossMarginPct = company-wide gross margin,
 *  used as a stand-in for that specific item's margin since item-level margins aren't available
 *  — this is a real, disclosed assumption, not a measured fact. */
export function inventoryDiscardScenario(
  slowMovingValue: number,
  recoveryRatePct: number,
  fastestItemDays: number,
  grossMarginPct: number
): DiscardScenarioResult {
  const recoveryRate = recoveryRatePct / 100;
  const cashRecovered = slowMovingValue * recoveryRate;
  const writeOff = slowMovingValue * (1 - recoveryRate);
  const turnsPerYear = fastestItemDays > 0 ? 365 / fastestItemDays : 0;
  const marginFraction = grossMarginPct / 100;
  const incrementalRevenue = marginFraction < 1 ? (cashRecovered * turnsPerYear) / (1 - marginFraction) : 0;
  const incrementalGrossProfit = incrementalRevenue * marginFraction;
  return { cashRecovered, writeOff, incrementalRevenue, incrementalGrossProfit };
}

// ===== Ideal ratio benchmarks (Financial Ratios tab) =====
// Widely-cited lender/textbook reference points, not a covenant specific to any one company or
// a single authoritative source — a sanity-check line, not a hard pass/fail rule. Deliberately
// NOT defined for margins/ROCE/ROA/turnovers: those are genuinely sector-dependent with no
// single defensible universal target.
export interface IdealRatioDef {
  key: string;
  ideal: number;
  direction: 'higher' | 'lower';
  remarkGood: string;
  remarkBad: string;
}
export const IDEAL_RATIOS: IdealRatioDef[] = [
  { key: 'currentRatio', ideal: 1.33, direction: 'higher', remarkGood: 'Comfortable buffer over current liabilities.', remarkBad: 'Tight — current liabilities are close to or exceed current assets.' },
  { key: 'quickRatio', ideal: 1.0, direction: 'higher', remarkGood: 'Can cover current liabilities without relying on inventory sales.', remarkBad: 'Depends on selling inventory to meet near-term obligations.' },
  { key: 'debtEquity', ideal: 2.0, direction: 'lower', remarkGood: '🟢 Low leverage / Healthy — comfortable buffer for further borrowing.', remarkBad: '🔴 High leverage — may constrain further borrowing capacity.' },
  { key: 'debtEbitda', ideal: 3.0, direction: 'lower', remarkGood: '🟢 Low leverage / Healthy — debt load is serviceable at current earnings.', remarkBad: '🔴 High leverage — debt is stretched relative to cash-generating capacity.' },
  { key: 'interestCoverage', ideal: 3.0, direction: 'higher', remarkGood: 'Earnings comfortably cover interest obligations.', remarkBad: 'Thin cushion — an earnings dip could strain interest payments.' },
  { key: 'debtorDays', ideal: 90, direction: 'lower', remarkGood: 'Collections are within the working-capital benchmark.', remarkBad: 'Collections are slower than benchmark — see Trade Receivables tab.' },
  { key: 'inventoryDays', ideal: 60, direction: 'lower', remarkGood: 'Stock is turning within the benchmark.', remarkBad: 'Stock is sitting longer than benchmark — see Inventory tab.' },
];
export function ratioVsIdeal(def: IdealRatioDef, curr: number): { isGood: boolean; position: 'above' | 'below' | 'at'; remark: string } {
  const isGood = def.direction === 'higher' ? curr >= def.ideal : curr <= def.ideal;
  const position = Math.abs(curr - def.ideal) < 0.001 ? 'at' : curr > def.ideal ? 'above' : 'below';
  return { isGood, position, remark: isGood ? def.remarkGood : def.remarkBad };
}
