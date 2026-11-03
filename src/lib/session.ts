/**
 * Signed-cookie sessions. Uses Web Crypto only, so it works in both the Edge middleware and
 * Node route handlers.
 *
 * Token = base64url(JSON payload) + "." + base64url(HMAC-SHA256(payload, secret))
 */
export const SESSION_COOKIE = 'mis_session';
export const SESSION_DAYS = 7;

export type Session =
  | { r: 'admin'; exp: number }
  | { r: 'client'; u: string; c: string; exp: number };

export function getSecret(): string {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || '';
}

const enc = new TextEncoder();

function b64u(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret) as any, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(payload: Session): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('ADMIN_PASSWORD is not configured on the server');
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body) as any);
  return `${body}.${b64u(sig)}`;
}

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  const secret = getSecret();
  if (!secret || !token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64u(sig) as any, enc.encode(body) as any);
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64u(body))) as Session;
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    if (payload.r === 'admin') return payload;
    if (payload.r === 'client' && payload.u && payload.c) return payload;
    return null;
  } catch {
    return null;
  }
}

export function newExpiry(): number {
  return Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 3600;
}
