import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { derive, computeHealthScore, computeMsmeClassification, computeAlerts, pctChange } from '@/lib/compute';
import { buildContext } from '@/lib/buildContext';
import { callClaude } from '@/lib/gemini';
import { EMPTY_LINE_ITEMS, FinancialLineItems } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: { periods: { orderBy: { sequence: 'asc' } } },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const currentPeriod = company.periods.find((p: any) => p.sequence === 0);
  const previousPeriod = company.periods.find((p: any) => p.sequence === 1);
  if (!currentPeriod || !previousPeriod) {
    return NextResponse.json({ error: 'This company needs two financial periods uploaded first' }, { status: 400 });
  }

  const A = derive({ ...EMPTY_LINE_ITEMS, ...(currentPeriod.data as Partial<FinancialLineItems>) });
  const P = derive({ ...EMPTY_LINE_ITEMS, ...(previousPeriod.data as Partial<FinancialLineItems>) });
  const health = computeHealthScore(A, P);
  const msme = computeMsmeClassification(A.ppe, A.revenue);
  const alerts = computeAlerts(A, P);

  const context = buildContext(company.name, currentPeriod.label, previousPeriod.label, A, P, health, msme.category, alerts);
  const revGrowth = pctChange(A.revenue, P.revenue);

  const prompt = `${context}

Write a concise CFO-style "Management Summary" for this period, in the style of:
"Revenue increased 11% and EBITDA margin declined from 19.2% to 17.6%..."
Include 2-3 short paragraphs covering revenue/profitability, working capital/liquidity, and debt — then a short numbered list of 2-3 management priorities. For any figure that moved more than 25% period-on-period${revGrowth !== null ? ` (revenue itself moved ${revGrowth.toFixed(1)}%)` : ''}, explicitly name it and explain what likely drove the change using the data above. Be specific with numbers. Do not invent any data not given above. Do not use markdown headers, just plain paragraphs and a numbered list.`;

  try {
    const text = await callClaude([{ role: 'user', content: prompt }]);
    return NextResponse.json({ summary: text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI request failed' }, { status: 502 });
  }
}
