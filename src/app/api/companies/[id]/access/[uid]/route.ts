import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ensureClientTable, forbidden, generatePassword, getSession, hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Remove a client login. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string; uid: string } }) {
  if ((await getSession(req))?.r !== 'admin') return forbidden();
  await ensureClientTable();
  await prisma.$executeRawUnsafe(`DELETE FROM "ClientUser" WHERE "id" = $1 AND "companyId" = $2`, params.uid, params.id);
  return NextResponse.json({ ok: true });
}

/** Reset a client's password. Returns the new password once. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; uid: string } }) {
  if ((await getSession(req))?.r !== 'admin') return forbidden();
  await ensureClientTable();
  const b = await req.json().catch(() => ({}));
  const password = typeof b.password === 'string' && b.password.length >= 8 ? b.password : generatePassword();
  await prisma.$executeRawUnsafe(`UPDATE "ClientUser" SET "passwordHash" = $1 WHERE "id" = $2 AND "companyId" = $3`, hashPassword(password), params.uid, params.id);
  return NextResponse.json({ password });
}
