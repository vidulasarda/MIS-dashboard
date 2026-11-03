import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildStartupContext } from '@/lib/buildStartupContext';
import { callClaude } from '@/lib/gemini';
import { StartupDataBundle } from '@/lib/startupTypes';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { messages } = (await req.json()) as { messages: { role: 'user' | 'assistant'; content: string }[] };
  if (!messages?.length) return NextResponse.json({ error: 'messages is required' }, { status: 400 });

  const company = await prisma.company.findUnique({ where: { id: params.id }, include: { startupData: true } });
  if (!company || !company.startupData) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bundle: StartupDataBundle = {
    months: company.startupData.months as any,
    assumptions: company.startupData.assumptions as any,
    capTable: company.startupData.capTable as any,
    dataRoom: company.startupData.dataRoom as any,
  };
  const context = buildStartupContext(company.name, bundle);

  const fullMessages = [
    { role: 'user' as const, content: context + '\n\nAnswer the following question(s) concisely (2-5 short paragraphs or a short list), in a direct fractional-CFO tone, using only the data above.' },
    { role: 'assistant' as const, content: 'Understood — I will answer using only that data.' },
    ...messages,
  ];

  try {
    const reply = await callClaude(fullMessages);
    return NextResponse.json({ reply });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI request failed' }, { status: 502 });
  }
}
