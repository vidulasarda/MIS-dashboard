import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { forbidden, getSession } from '@/lib/auth';
import { EMPTY_LINE_ITEMS, FinancialLineItems } from '@/lib/types';

export const dynamic = 'force-dynamic';

const KEYS = Object.keys(EMPTY_LINE_ITEMS) as (keyof FinancialLineItems)[];
const TOTALS: string[] = ['totalIncome', 'totalExpenses', 'pbt', 'pat']; // recalculated, not edited directly

/** Raw line items for the edit screen (admin only). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if ((await getSession(req))?.r !== 'admin') return forbidden();
  const periods = await prisma.financialPeriod.findMany({ where: { companyId: params.id }, orderBy: { sequence: 'asc' } });
  const cur = periods.find((p: any) => p.sequence === 0), prev = periods.find((p: any) => p.sequence === 1);
  return NextResponse.json({
    keys: KEYS,
    currentLabel: cur?.label ?? 'Current', previousLabel: prev?.label ?? 'Previous',
    current: { ...EMPTY_LINE_ITEMS, ...((cur?.data as object) ?? {}) },
    previous: { ...EMPTY_LINE_ITEMS, ...((prev?.data as object) ?? {}) },
  });
}

/** Save edited line items (admin only). Only known numeric keys are accepted. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if ((await getSession(req))?.r !== 'admin') return forbidden();
  const b = await req.json().catch(() => ({}));
  for (const [seq, incoming] of [[0, b.current], [1, b.previous]] as [number, any][]) {
    if (!incoming || typeof incoming !== 'object') continue;
    const row = await prisma.financialPeriod.findUnique({ where: { companyId_sequence: { companyId: params.id, sequence: seq } } });
    if (!row) continue;
    const next: Record<string, number> = { ...EMPTY_LINE_ITEMS, ...((row.data as object) ?? {}) };
    let changed = false;
    for (const k of KEYS) {
      if (incoming[k] === undefined || TOTALS.includes(k)) continue;
      const n = Number(incoming[k]);
      if (!isFinite(n)) return NextResponse.json({ error: `"${k}" is not a number` }, { status: 400 });
      if (n !== next[k]) changed = true;
      next[k] = n;
    }
    if (changed) {
      // keep the subtotals consistent with the lines that were edited
      next.totalIncome = next.revenue + next.otherIncome;
      next.totalExpenses = next.purchases + next.directExpenses + next.changeInInventories + next.depreciation + next.financeCost + next.otherExpenses;
      next.pbt = next.totalIncome - next.totalExpenses;
      next.pat = next.pbt - next.tax;
    }
    await prisma.financialPeriod.update({ where: { id: row.id }, data: { data: next as any } });
  }
  return NextResponse.json({ ok: true });
}
