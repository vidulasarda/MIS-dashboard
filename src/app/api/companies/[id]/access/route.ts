import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { ensureClientTable, findClientByEmail, forbidden, generatePassword, getSession, hashPassword, listClients } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** List the client logins for a company (admin only). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if ((await getSession(req))?.r !== 'admin') return forbidden();
  return NextResponse.json(await listClients(params.id));
}

/** Create a client login. Returns the password once; it is stored hashed. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if ((await getSession(req))?.r !== 'admin') return forbidden();
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  if (email === 'admin') return NextResponse.json({ error: 'That name is reserved' }, { status: 400 });
  const company = await prisma.company.findUnique({ where: { id: params.id } });
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  if (await findClientByEmail(email)) return NextResponse.json({ error: 'This email already has a login (for this or another company)' }, { status: 409 });
  const password = typeof b.password === 'string' && b.password.length >= 8 ? b.password : generatePassword();
  await ensureClientTable();
  const id = 'cu_' + randomBytes(10).toString('hex');
  await prisma.$executeRawUnsafe(
    `INSERT INTO "ClientUser" ("id","companyId","email","passwordHash") VALUES ($1,$2,$3,$4)`,
    id, params.id, email, hashPassword(password));
  return NextResponse.json({ id, email, password });
}
