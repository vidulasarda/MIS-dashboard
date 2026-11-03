import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { forbidden, getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if ((await getSession(req))?.r !== 'admin') return forbidden();
  const companies = await prisma.company.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { periods: { orderBy: { sequence: 'asc' } }, startupData: true },
  });
  return NextResponse.json(
    companies.map((c: any) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      updatedAt: c.updatedAt,
      hasFinancials: c.type === 'STARTUP' ? !!c.startupData : c.periods.length >= 2,
      currentLabel: c.type === 'STARTUP' ? null : c.periods.find((p: any) => p.sequence === 0)?.label ?? null,
    }))
  );
}
