import { NextRequest, NextResponse } from 'next/server';
import { findClientByEmail, safeEqual, setSessionCookie, verifyPassword } from '@/lib/auth';
import { newExpiry, signSession } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  const id = String(email ?? '').trim().toLowerCase();
  const pw = String(password ?? '');
  if (!id || !pw) return NextResponse.json({ error: 'Enter your email and password' }, { status: 400 });

  const adminPw = process.env.ADMIN_PASSWORD;
  if (id === 'admin') {
    if (!adminPw) return NextResponse.json({ error: 'ADMIN_PASSWORD is not set on the server. Add it in Vercel → Settings → Environment Variables and redeploy.' }, { status: 500 });
    if (!safeEqual(pw, adminPw)) { await wait(700); return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 }); }
    const res = NextResponse.json({ role: 'admin', redirect: '/dashboard' });
    setSessionCookie(res, await signSession({ r: 'admin', exp: newExpiry() }));
    return res;
  }

  const user = await findClientByEmail(id).catch(() => null);
  if (!user || !verifyPassword(pw, user.passwordHash)) {
    await wait(700);
    return NextResponse.json({ error: 'Wrong email or password' }, { status: 401 });
  }
  const res = NextResponse.json({ role: 'client', redirect: `/company/${user.companyId}` });
  setSessionCookie(res, await signSession({ r: 'client', u: user.id, c: user.companyId, exp: newExpiry() }));
  return res;
}
