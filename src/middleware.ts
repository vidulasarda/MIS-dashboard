import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

/**
 * Gatekeeper for the whole app.
 *  - no valid session            -> /login (pages) or 401 (API)
 *  - admin                       -> everything
 *  - client (one company only)   -> only that company's page and the APIs that page needs
 * Route handlers re-check the company id themselves (defence in depth).
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (pathname === '/login' || pathname.startsWith('/api/auth/')) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  if (session.r === 'admin') return NextResponse.next();

  // ----- client -----
  const cid = session.c;
  if (isApi) {
    const ok =
      pathname === `/api/companies/${cid}` ||
      pathname.startsWith(`/api/companies/${cid}/`) ||
      pathname === '/api/upload' ||
      pathname === '/api/convert';
    if (!ok) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
    return NextResponse.next();
  }
  if (pathname === `/company/${cid}` || pathname.startsWith(`/company/${cid}/`)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/company/${cid}`;
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // everything except Next internals and static files in /public (e.g. the template download)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:xlsx|png|jpg|svg|ico|css|js)$).*)'],
};
