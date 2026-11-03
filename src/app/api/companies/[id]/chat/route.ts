import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { derive, computeHealthScore, computeMsmeClassification, computeAlerts } from '@/lib/compute';
import { buildContext } from '@/lib/buildContext';
import { callClaude } from '@/lib/gemini';
import { EMPTY_LINE_ITEMS, FinancialLineItems } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { messages } = (await req.json()) as { messages: { role: 'user' | 'assistant'; content: string }[] };
  if (!messages?.length) return NextResponse.json({ error: 'messages is required' }, { status: 400 });

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

  const fullMessages = [
    { role: 'user' as const, content: context + '\n\nAnswer the following question(s) from management concisely (2-5 short paragraphs or a short list), in a direct CFO-advisor tone, using only the data above.' },
    { role: 'assistant' as const, content: "Understood — I will answer using only that data, and flag anything that needs ledger-level detail I don't have." },
    ...messages,
  ];

  try {
    const reply = await callClaude(fullMessages);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI request failed' }, { status: 502 });
  }
}
