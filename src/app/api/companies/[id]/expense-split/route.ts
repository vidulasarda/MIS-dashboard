import { NextRequest, NextResponse } from 'next/server';
import { canAccessCompany, forbidden, getSession, unauthorised } from '@/lib/auth';
import { clearSplit, getSplit, parseExpenseSplit, replaceSplit } from '@/lib/expenseSplit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function guard(req: NextRequest, id: string) {
  const s = await getSession(req);
  if (!s) return unauthorised();
  if (!canAccessCompany(s, id)) return forbidden();
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, params.id); if (g) return g;
  return NextResponse.json({ rows: await getSplit(params.id) });
}

/** Upload an Excel with Expense head / Current year / Previous year. Replaces the earlier split. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, params.id); if (g) return g;
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Choose an Excel file' }, { status: 400 });
  try {
    const { rows, warnings } = parseExpenseSplit(Buffer.from(await file.arrayBuffer()));
    if (!rows.length) return NextResponse.json({ error: 'No expense rows found. The sheet needs a header row with "Expense head" and "Current year" columns (use the template).' }, { status: 400 });
    await replaceSplit(params.id, rows);
    return NextResponse.json({ ok: true, count: rows.length, warnings });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Could not read the file' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await guard(req, params.id); if (g) return g;
  await clearSplit(params.id);
  return NextResponse.json({ ok: true });
}
