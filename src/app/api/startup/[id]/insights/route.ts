import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildStartupContext } from '@/lib/buildStartupContext';
import { callClaude } from '@/lib/gemini';
import { StartupDataBundle } from '@/lib/startupTypes';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const company = await prisma.company.findUnique({ where: { id: params.id }, include: { startupData: true } });
  if (!company || !company.startupData) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const bundle: StartupDataBundle = {
    months: company.startupData.months as any,
    assumptions: company.startupData.assumptions as any,
    capTable: company.startupData.capTable as any,
    dataRoom: company.startupData.dataRoom as any,
  };
  const context = buildStartupContext(company.name, bundle);

  const prompt = `${context}

Write a concise, investor-ready "Management Summary" for this startup's model. Include 2-3 short paragraphs covering: (1) growth trajectory (MRR/ARR/customers), (2) burn, runway, and burn multiple efficiency, (3) unit economics and what it implies for fundraising timing and terms — then a short numbered list of 2-3 concrete recommendations. Be specific with numbers from the data above. Do not invent any data not given above. Do not use markdown headers, just plain paragraphs and a numbered list.`;

  try {
    const text = await callClaude([{ role: 'user', content: prompt }]);
    return NextResponse.json({ summary: text });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI request failed' }, { status: 502 });
  }
}
