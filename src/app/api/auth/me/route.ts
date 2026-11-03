import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const s = await getSession(req);
  if (!s) return NextResponse.json({ role: null }, { status: 401 });
  return NextResponse.json(s.r === 'admin' ? { role: 'admin' } : { role: 'client', companyId: s.c });
}
