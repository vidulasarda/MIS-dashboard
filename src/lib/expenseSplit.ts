import { randomBytes } from 'crypto';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';

export interface SplitRow { head: string; current: number; previous: number }

let ready = false;
export async function ensureSplitTable() {
  if (ready) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "ExpenseSplit" (
       "id" TEXT PRIMARY KEY,
       "companyId" TEXT NOT NULL REFERENCES "Company"("id") ON DELETE CASCADE,
       "head" TEXT NOT NULL,
       "current" DOUBLE PRECISION NOT NULL DEFAULT 0,
       "previous" DOUBLE PRECISION NOT NULL DEFAULT 0,
       "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );
  ready = true;
}

export async function getSplit(companyId: string): Promise<SplitRow[]> {
  await ensureSplitTable();
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "head","current","previous" FROM "ExpenseSplit" WHERE "companyId" = $1 ORDER BY "current" DESC`, companyId)) as SplitRow[];
  return rows.map((r) => ({ head: r.head, current: Number(r.current), previous: Number(r.previous) }));
}

export async function replaceSplit(companyId: string, rows: SplitRow[]) {
  await ensureSplitTable();
  await prisma.$executeRawUnsafe(`DELETE FROM "ExpenseSplit" WHERE "companyId" = $1`, companyId);
  for (const r of rows) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ExpenseSplit" ("id","companyId","head","current","previous") VALUES ($1,$2,$3,$4,$5)`,
      'es_' + randomBytes(8).toString('hex'), companyId, r.head, r.current, r.previous);
  }
}

export async function clearSplit(companyId: string) {
  await ensureSplitTable();
  await prisma.$executeRawUnsafe(`DELETE FROM "ExpenseSplit" WHERE "companyId" = $1`, companyId);
}

function num(v: any): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).trim();
  if (!s || s === '-') return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/cr$/i.test(s)) neg = true;
  s = s.replace(/[₹,\s]|dr$|cr$|rs\.?/gi, '');
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return neg ? -n : n;
}

/**
 * Reads "Expense head | Current year | Previous year" from the first sheet that has such a header.
 * Column names only need to contain the key words. A single "Amount" column is treated as current year.
 * Duplicate heads are added together; "Total" rows are ignored so they are not double counted.
 */
export function parseExpenseSplit(buffer: Buffer): { rows: SplitRow[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const warnings: string[] = [];
  for (const name of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, defval: '', raw: true });
    for (let i = 0; i < Math.min(grid.length, 15); i++) {
      const hdr = (grid[i] || []).map((c) => String(c).toLowerCase().trim());
      const labelCol = hdr.findIndex((h) => /expense|head|particular|ledger|nature|name|description/.test(h));
      if (labelCol < 0) continue;
      let cur = hdr.findIndex((h, j) => j !== labelCol && /current|this year|cy\b|fy\s*2\d|amount|total/.test(h) && !/prev|last|py\b/.test(h));
      const prev = hdr.findIndex((h, j) => j !== labelCol && /prev|last year|py\b|prior/.test(h));
      if (cur < 0) continue;
      const map = new Map<string, SplitRow>();
      for (let r = i + 1; r < grid.length; r++) {
        const row = grid[r] || [];
        const head = String(row[labelCol] ?? '').trim();
        if (!head || /^(total|grand total|sub ?total)/i.test(head) || /^note|^instruction|^example/i.test(head)) continue;
        const c = num(row[cur]), p = prev >= 0 ? num(row[prev]) : 0;
        if (c === 0 && p === 0) continue;
        const key = head.toLowerCase();
        const ex = map.get(key);
        if (ex) { ex.current += c; ex.previous += p; } else map.set(key, { head, current: c, previous: p });
      }
      const rows = Array.from(map.values());
      if (rows.length) {
        if (prev < 0) warnings.push('No previous-year column found, so the comparison column will be blank.');
        return { rows, warnings };
      }
    }
  }
  return { rows: [], warnings };
}
