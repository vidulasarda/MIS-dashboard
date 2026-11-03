/**
 * Signed / provisional financial statements (text PDF) -> FinancialLineItems for two years.
 * Uses text positions to rebuild columns, then the same label matching as the Excel parser.
 * Scanned (image-only) PDFs contain no text and are rejected with a clear message.
 */
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { FinancialLineItems } from './types';
import { parseFinancialsRows } from './parseFinancials';

export interface PdfParseResult {
  current: Partial<FinancialLineItems>;
  previous: Partial<FinancialLineItems>;
  matchedLabels: { label: string; key: string }[];
  warnings: string[];
  companyGuess?: string;
  yearGuess?: string;
}

async function render(pageData: any): Promise<string> {
  const tc = await pageData.getTextContent({ normalizeWhitespace: true });
  const items = (tc.items as any[]).filter((i) => i.str && i.str.trim() !== '').map((i) => ({ s: i.str.trim() as string, x: i.transform[4] as number, y: i.transform[5] as number }));
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: typeof items }[] = [];
  let cur: { y: number; items: typeof items } | null = null;
  for (const it of items) {
    if (cur && Math.abs(cur.y - it.y) <= 2.5) cur.items.push(it);
    else { cur = { y: it.y, items: [it] }; lines.push(cur); }
  }
  return lines.map((l) => l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join('\t')).join('\n') + '\n';
}

const NUM = /^\(?-?\d[\d,]*(\.\d+)?\)?$/;
function toNum(t: string): number {
  if (t === '-' || t === '—' || t === '–') return 0;
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-');
  const v = parseFloat(t.replace(/[(),-]/g, ''));
  return neg ? -v : v;
}

export async function parsePdfFinancials(buffer: Buffer): Promise<PdfParseResult> {
  const data = await pdf(buffer, { pagerender: render });
  const text = data.text ?? '';
  if (text.replace(/\s/g, '').length < 200) {
    throw new Error('This PDF has no readable text (it looks scanned). Upload a text PDF, or the Excel / Tally trial balance instead.');
  }
  const warnings: string[] = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // unit detection
  const head = lines.slice(0, 80).join(' ');
  let scale = 1;
  if (/(in|₹)\s*(lakhs?|lacs?)\b|\(\s*rs\.?\s*in\s*lakhs?/i.test(head)) scale = 1e5;
  else if (/(in|₹)\s*crores?\b|\(\s*rs\.?\s*in\s*crores?/i.test(head)) scale = 1e7;
  else if (/(in|₹)\s*thousands?\b/i.test(head)) scale = 1e3;
  if (scale !== 1) warnings.push(`Amounts are stated in ${scale === 1e5 ? 'lakhs' : scale === 1e7 ? 'crores' : 'thousands'}; converted to rupees.`);

  const current: Partial<FinancialLineItems> = {}, previous: Partial<FinancialLineItems> = {};
  const complete = new Set<string>();
  const matchedLabels: { label: string; key: string }[] = [];

  for (const line of lines) {
    if (/^schedules? annexed/i.test(line)) break;
    const toks = line.split('\t').map((t) => t.trim()).filter(Boolean);
    // trailing numeric tokens
    let k = toks.length;
    while (k > 0 && (NUM.test(toks[k - 1]) || /^[-—–]$/.test(toks[k - 1]))) k--;
    const nums = toks.slice(k).map(toNum);
    const label = toks.slice(0, k).join(' ').replace(/^\(?[a-z]\)\s*/i, '').trim();
    if (!label || !nums.length) continue;
    const parsed = parseFinancialsRows([[label, ...nums]]);
    for (const m of parsed.matchedLabels) {
      const key = m.key as keyof FinancialLineItems;
      const c = parsed.current[key], p = parsed.previous[key];
      const isComplete = c !== undefined && p !== undefined;
      if (complete.has(key)) continue;
      if (current[key] !== undefined && !isComplete) continue; // keep first partial too
      if (c !== undefined) current[key] = c * scale;
      if (p !== undefined) previous[key] = p * scale;
      if (isComplete) complete.add(key);
      matchedLabels.push({ label, key });
    }
  }

  if (!matchedLabels.length) throw new Error('Could not find a balance sheet or profit & loss in this PDF.');
  // PDF statements normally show nil as "-": treat a missing previous-year tax as 0 only if a current value exists
  if (current.tax !== undefined && previous.tax === undefined) previous.tax = 0;

  const company = lines.find((l) => /^[A-Z][A-Z0-9 .,&'()-]{4,60}$/.test(l) && !/BALANCE|PROFIT|PARTICULARS|NOTE|TOTAL|EXPENSES|INCOME/.test(l));
  const y = text.match(/31(?:st)?\s*(?:march|mar)[\s,.]*((?:20)\d\d)/i) ?? text.match(/31\.03\.((?:20)\d\d)/);
  const need = ['revenue', 'pat', 'receivables', 'inventories', 'tradePayables', 'cash'];
  const missing = need.filter((n) => (current as any)[n] === undefined);
  if (missing.length) warnings.push(`Not found in the PDF: ${missing.join(', ')}. Fill these in the template before uploading.`);
  return { current, previous, matchedLabels, warnings, companyGuess: company, yearGuess: y ? `FY${y[1]}` : undefined };
}
