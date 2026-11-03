import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { processStartupWorkbook } from '@/lib/parseStartupModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    return await handleUpload(req);
  } catch (err) {
    console.error('Startup upload failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}

async function handleUpload(req: NextRequest) {
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const companyId = form.get('companyId') as string | null;
  const companyName = form.get('companyName') as string | null;

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  if (!companyId && !companyName) {
    return NextResponse.json({ error: 'companyName is required when creating a new company' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = processStartupWorkbook(buffer);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Could not parse this file', sheets: result.sheets }, { status: 400 });
  }

  let company;
  if (companyId) {
    company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  } else {
    company = await prisma.company.create({ data: { name: companyName!, type: 'STARTUP' } });
  }

  await prisma.startupData.upsert({
    where: { companyId: company.id },
    update: {
      months: result.data.months as any,
      assumptions: result.data.assumptions as any,
      capTable: result.data.capTable as any,
      dataRoom: result.data.dataRoom as any,
    },
    create: {
      companyId: company.id,
      months: result.data.months as any,
      assumptions: result.data.assumptions as any,
      capTable: result.data.capTable as any,
      dataRoom: result.data.dataRoom as any,
    },
  });

  return NextResponse.json({
    companyId: company.id,
    companyName: company.name,
    sheets: result.sheets,
    fieldsMatched: result.fieldsMatched.length,
    fieldsMissing: result.fieldsMissing,
    monthsFound: result.data.months.length,
    dataRoomItems: result.data.dataRoom.length,
  });
}
