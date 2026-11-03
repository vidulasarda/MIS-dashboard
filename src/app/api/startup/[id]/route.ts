import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: { startupData: true },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!company.startupData) {
    return NextResponse.json({ id: company.id, name: company.name, hasData: false });
  }

  return NextResponse.json({
    id: company.id,
    name: company.name,
    hasData: true,
    months: company.startupData.months,
    assumptions: company.startupData.assumptions,
    capTable: company.startupData.capTable,
    dataRoom: company.startupData.dataRoom,
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await prisma.company.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
