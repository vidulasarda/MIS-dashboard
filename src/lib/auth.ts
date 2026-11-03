import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE, SESSION_DAYS, Session, verifySession } from '@/lib/session';

/* ---------- passwords ---------- */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(scryptSync(pw, salt, 32).toString('hex'));
  const b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[bytes[i] % chars.length];
  return s;
}

/* ---------- client-user table (created on first use; no migration step needed) ---------- */
let tableReady = false;
export async function ensureClientTable() {
  if (tableReady) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "ClientUser" (
       "id" TEXT PRIMARY KEY,
       "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
       "email" TEXT NOT NULL UNIQUE,
       "passwordHash" TEXT NOT NULL,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );
  tableReady = true;
}

export interface ClientUserRow { id: string; companyId: string; email: string; passwordHash: string; createdAt: Date }

export async function findClientByEmail(email: string): Promise<ClientUserRow | null> {
  await ensureClientTable();
  const rows = (await prisma.$queryRawUnsafe(`SELECT * FROM "ClientUser" WHERE "email" = $1 LIMIT 1`, email)) as ClientUserRow[];
  return rows[0] ?? null;
}

export async function listClients(companyId: string) {
  await ensureClientTable();
  return (await prisma.$queryRawUnsafe(
    `SELECT "id","email","createdAt" FROM "ClientUser" WHERE "companyId" = $1 ORDER BY "createdAt"`, companyId)) as { id: string; email: string; createdAt: Date }[];
}

/* ---------- request helpers ---------- */
export async function getSession(req: NextRequest): Promise<Session | null> {
  return verifySession(req.cookies.get(SESSION_COOKIE)?.value);
}

export function canAccessCompany(s: Session | null, companyId: string | null | undefined): boolean {
  if (!s) return false;
  if (s.r === 'admin') return true;
  return !!companyId && s.c === companyId;
}

export const forbidden = () => NextResponse.json({ error: 'Not allowed' }, { status: 403 });
export const unauthorised = () => NextResponse.json({ error: 'Please log in' }, { status: 401 });

export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/',
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}
