'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error ?? 'Login failed'); return; }
      window.location.href = d.redirect ?? '/dashboard';
    } catch {
      setError('Could not reach the server');
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={submit} className="card p-8 w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-display font-semibold text-2xl">MIS Dashboard</h1>
          <p className="text-inksoft text-sm">Log in to view your company&apos;s MIS.</p>
        </div>
        <div>
          <label className="text-xs font-semibold text-inksoft uppercase">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required
            className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" />
        </div>
        <div>
          <label className="text-xs font-semibold text-inksoft uppercase">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required
            className="w-full border border-rule rounded px-3 py-2 bg-[#FBF8EF]" />
        </div>
        {error && <p className="text-oxblood text-sm">{error}</p>}
        <button type="submit" disabled={loading} className="w-full bg-ink text-paper font-semibold px-4 py-2 rounded hover:bg-brassdark transition disabled:opacity-50">
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
