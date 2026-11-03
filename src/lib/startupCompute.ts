import { StartupMonth, CapTableData } from './startupTypes';
import { formatINR, pctChange } from './compute';

export { formatINR, pctChange } from './compute';

export function pctF(curr: number, prev: number, decimals = 1): string {
  const v = pctChange(curr, prev);
  return v === null ? 'N/A' : (v >= 0 ? '+' : '') + v.toFixed(decimals);
}

/** Ownership % a new investor gets for a given pre-money valuation and raise size, given the
 *  company's existing fully-diluted share count (option-pool top-up not included — see caller). */
export function ownershipPct(premoney: number, raise: number, existingFdShares: number): number {
  const price = premoney / existingFdShares;
  const newShares = raise / price;
  return newShares / (existingFdShares + newShares);
}

export function capTableBaseCase(ct: CapTableData) {
  const postmoney = ct.basePremoney + ct.baseRaise;
  const pricePerShare = ct.basePremoney / ct.existingFdShares;
  const newSharesIssued = ct.baseRaise / pricePerShare;
  const newInvestorOwnership = newSharesIssued / (ct.existingFdShares + newSharesIssued);
  return { postmoney, pricePerShare, newSharesIssued, newInvestorOwnership };
}

export function dataRoomStats(items: { status: string }[]) {
  const ready = items.filter((d) => d.status === 'Ready').length;
  const inProgress = items.filter((d) => d.status === 'In Progress').length;
  const notStarted = items.filter((d) => d.status === 'Not Started').length;
  const total = items.length || 1;
  return {
    ready, inProgress, notStarted, total,
    readyPct: (ready / total) * 100,
    inProgressPct: (inProgress / total) * 100,
    notStartedPct: (notStarted / total) * 100,
  };
}

/** Deterministic, no-AI-required explanation for why runway is what it is / when to fundraise. */
export function runwayGuidance(months: StartupMonth[]): string {
  const firstUnder9 = months.findIndex((m) => m.runway < 9);
  const startMonth = firstUnder9 >= 0 ? months[Math.max(0, firstUnder9 - 1)]?.month ?? months[0].month : null;
  if (!startMonth) {
    return 'Runway never drops below 9 months across this horizon at the modeled burn rate — no urgency signal from this model alone.';
  }
  return `Runway drops under 9 months around ${startMonth} — a common rule of thumb is to start fundraising with 6+ months of runway remaining, which on this trajectory means kicking off the process by then.`;
}

/** Burn multiple qualitative band (David Sacks' commonly-cited thresholds). */
export function burnMultipleBand(bm: number | null): { label: string; cls: 'good' | 'watch' | 'critical' } {
  if (bm === null) return { label: 'N/A', cls: 'watch' };
  if (bm < 1) return { label: 'Amazing', cls: 'good' };
  if (bm <= 1.5) return { label: 'Good', cls: 'good' };
  if (bm <= 2) return { label: 'Suspicious', cls: 'watch' };
  if (bm <= 3) return { label: 'Bad', cls: 'watch' };
  return { label: 'Concerning', cls: 'critical' };
}

export function ltvCacBand(ratio: number): { label: string; cls: 'good' | 'watch' | 'critical' } {
  if (ratio >= 3) return { label: 'Healthy', cls: 'good' };
  if (ratio >= 1) return { label: 'Marginal', cls: 'watch' };
  return { label: 'Unsustainable', cls: 'critical' };
}
