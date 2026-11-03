import { FifoResult } from './types';

interface LedgerRow { date: Date; debit: number; credit: number; }

function bucketDays(days: number): 'b0_30' | 'b31_60' | 'b61_90' | 'b91_180' | 'b181_365' | 'b365plus' {
  if (days <= 30) return 'b0_30';
  if (days <= 60) return 'b31_60';
  if (days <= 90) return 'b61_90';
  if (days <= 180) return 'b91_180';
  if (days <= 365) return 'b181_365';
  return 'b365plus';
}

export function computeFifoAgeing(rows: LedgerRow[], asOf: Date): FifoResult {
  const sorted = [...rows]
    .filter((r) => r.debit !== 0 || r.credit !== 0)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const queue: { date: Date; amount: number }[] = [];
  const collectionDays: { days: number; amount: number }[] = [];
  let unmatchedCredit = 0;
  let totalInvoiced = 0;

  for (const row of sorted) {
    const net = row.debit - row.credit;
    if (net > 0) {
      queue.push({ date: row.date, amount: net });
      totalInvoiced += row.debit;
    } else if (net < 0) {
      let toConsume = -net;
      while (toConsume > 1e-6 && queue.length > 0) {
        const lot = queue[0];
        const matched = Math.min(lot.amount, toConsume);
        const days = Math.round((row.date.getTime() - lot.date.getTime()) / 86400000);
        collectionDays.push({ days, amount: matched });
        if (lot.amount <= toConsume + 1e-6) {
          toConsume -= lot.amount;
          queue.shift();
        } else {
          lot.amount -= toConsume;
          toConsume = 0;
        }
      }
      if (toConsume > 1e-6) unmatchedCredit += toConsume;
    }
  }

  const openLots = { b0_30: 0, b31_60: 0, b61_90: 0, b91_180: 0, b181_365: 0, b365plus: 0 };
  for (const lot of queue) {
    const age = Math.round((asOf.getTime() - lot.date.getTime()) / 86400000);
    openLots[bucketDays(age)] += lot.amount;
  }
  const totalOpen = Object.values(openLots).reduce((s, v) => s + v, 0);

  const collectionSpeed = { b0_30: 0, b31_60: 0, b61_90: 0, b91_180: 0, b181_365: 0, b365plus: 0 };
  for (const c of collectionDays) collectionSpeed[bucketDays(c.days)] += c.amount;
  const totalMatched = collectionDays.reduce((s, c) => s + c.amount, 0);
  const weightedAvgDays = totalMatched
    ? collectionDays.reduce((s, c) => s + c.days * c.amount, 0) / totalMatched
    : 0;

  return {
    asOf: asOf.toISOString().slice(0, 10),
    openLots,
    totalOpen,
    collectionSpeed,
    totalMatched,
    weightedAvgDays: Math.round(weightedAvgDays * 10) / 10,
    unmatchedCredit,
    totalInvoiced,
    transactionCount: sorted.length,
  };
}
