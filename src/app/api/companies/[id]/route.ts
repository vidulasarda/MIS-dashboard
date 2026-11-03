import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { derive, computeHealthScore, computeMsmeClassification, computeAlerts } from '@/lib/compute';
import { computeFifoAgeing } from '@/lib/fifo';
import { EMPTY_LINE_ITEMS, FinancialLineItems } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: { periods: { orderBy: { sequence: 'asc' } } },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const currentPeriod = company.periods.find((p: any) => p.sequence === 0);
  const previousPeriod = company.periods.find((p: any) => p.sequence === 1);

  if (!currentPeriod || !previousPeriod) {
    return NextResponse.json({ id: company.id, name: company.name, hasFinancials: false });
  }

  const currData = { ...EMPTY_LINE_ITEMS, ...(currentPeriod.data as Partial<FinancialLineItems>) };
  const prevData = { ...EMPTY_LINE_ITEMS, ...(previousPeriod.data as Partial<FinancialLineItems>) };
  const A = derive(currData);
  const P = derive(prevData);
  const health = computeHealthScore(A, P);
  const msme = computeMsmeClassification(A.ppe, A.revenue);
  const alerts = computeAlerts(A, P);

  const ledgerNames = await prisma.ledgerTransaction.findMany({
    where: { companyId: company.id },
    select: { ledgerName: true },
    distinct: ['ledgerName'],
  });
  const fifoByLedger: Record<string, ReturnType<typeof computeFifoAgeing>> = {};
  for (const { ledgerName } of ledgerNames) {
    const rows = await prisma.ledgerTransaction.findMany({ where: { companyId: company.id, ledgerName } });
    fifoByLedger[ledgerName] = computeFifoAgeing(
      rows.map((r: any) => ({ date: r.date, debit: r.debit, credit: r.credit })),
      currentPeriod.periodEnd
    );
  }

  return NextResponse.json({
    id: company.id,
    name: company.name,
    hasFinancials: true,
    currentLabel: currentPeriod.label,
    previousLabel: previousPeriod.label,
    current: A,
    previous: P,
    health,
    msme,
    alerts,
    disclosedReceivablesAgeing: currentPeriod.disclosedReceivablesAgeing ?? null,
    disclosedPayablesMsmeAgeing: currentPeriod.disclosedPayablesMsmeAgeing ?? null,
    disclosedPayablesOtherAgeing: currentPeriod.disclosedPayablesOtherAgeing ?? null,
    disclosedInventoryAgeing: currentPeriod.disclosedInventoryAgeing ?? null,
    fifoByLedger,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.company.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
