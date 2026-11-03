import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { derive, computeHealthScore, computeMsmeClassification, computeAlerts } from '@/lib/compute';
import { buildContext, buildVarianceContext } from '@/lib/buildContext';
import { callClaude } from '@/lib/gemini';
import { EMPTY_LINE_ITEMS, FinancialLineItems } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function formatINRForPrompt(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10000000) return `\u20B9${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `\u20B9${(abs / 100000).toFixed(2)} L`;
  return `\u20B9${Math.round(abs).toLocaleString('en-IN')}`;
}

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
  const variance = buildVarianceContext(currentPeriod.label, previousPeriod.label, A, P);

  // Structured three-section summary. The variance block above contains pre-computed, verified
  // percentages so the model interprets rather than calculates — that's what keeps the numbers right.
  const prompt = `${context}

${variance}

Write a management summary for the business owner. They are not an accountant. They will read this for 30 seconds. Your job is to make them understand what actually happened and what to do about it.

Use EXACTLY this structure, with these exact three headings and nothing else:

OVERALL
Two or three sentences. Lead with the single most important story in these numbers — usually the relationship between two figures, not one figure alone. For example: revenue grew X% but receivables grew Y%, which means growth is being funded by slower collection rather than cash. Name the real consequence in plain words.

WHAT'S GOOD
Two to four short bullet points, each starting with "- ". Only genuine positives backed by a number from the data. If margins improved, leverage reduced, collections sped up, or a ratio crossed above its reference level, say so with the figure. Never pad this section — if there is only one real positive, give only one.

WHAT'S CONCERNING
Two to four short bullet points, each starting with "- ". Each must name the number, say why it matters in business terms (cash tied up, tax exposure, margin lost), and where possible quantify the impact in rupees using the per-day cash figures provided above. Put the most urgent first.

RULES:
- Write like you are talking to the owner directly. Say "your" not "the company's".
- Every claim needs a number attached. No vague statements like "margins are under pressure" without the figure.
- Explain WHY, not just WHAT. "Debtor days rose 10 days" is useless alone; "Debtor days rose 10 days, which is ${formatINRForPrompt(A.revenue / 365 * 10)} of your cash sitting with customers instead of in your bank" is useful.
- No markdown formatting, no bold, no asterisks, no headers beyond the three named above.
- Do not invent numbers. Only use figures given above.
- Be direct. If something is bad, say it plainly. Do not soften it into meaninglessness.`;

  try {
    const text = await callClaude([{ role: 'user', content: prompt }], 900);
    return NextResponse.json({ summary: text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI request failed' }, { status: 502 });
  }
}
