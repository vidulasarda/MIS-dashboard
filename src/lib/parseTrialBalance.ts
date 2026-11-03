/**
 * Tally Trial Balance (Excel / CSV) -> standard FinancialLineItems.
 *
 * Tally exports differ (group-level vs expanded, one or two balance columns), so the parser:
 *  1. finds the Particulars / Debit / Credit columns (closing balance preferred),
 *  2. rebuilds the group -> ledger hierarchy from the numbers themselves (a group row is a
 *     "container" when the rows after it add up to its balance), so nothing is counted twice,
 *  3. maps each leaf ledger to a template line from its group path and name,
 *  4. reports every mapping so the user can review it. Rows it cannot place are listed, never hidden.
 * Amounts in rupees. Debit-positive internally (net = debit - credit).
 */
import { FinancialLineItems, EMPTY_LINE_ITEMS } from './types';

export interface TbRow { name: string; net: number; opening: number | null }
export interface MappedLeaf { name: string; path: string; key: keyof FinancialLineItems | 'party-debtor' | 'party-creditor'; amount: number; approx?: boolean }
export interface TbParty { name: string; amount: number }
export interface TbOptions { closingStock?: number | null }
export interface TbResult {
  items: Partial<FinancialLineItems>;
  mapped: MappedLeaf[];
  unmapped: MappedLeaf[];
  warnings: string[];
  tbDebit: number; tbCredit: number;
  debtors: TbParty[]; creditors: TbParty[];
  rowsRead: number;
}

export function tbNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let s = String(v).trim();
  if (!s || s === '-') return 0;
  let sign = 1;
  if (/\bcr\b\.?$/i.test(s)) sign = -1;        // "12,345.00 Cr"
  s = s.replace(/\b(dr|cr)\b\.?$/i, '').trim();
  if (/^\(.*\)$/.test(s)) { sign *= -1; s = s.slice(1, -1); }
  s = s.replace(/[₹,\s]/g, '');
  if (!/^-?\d*\.?\d+$/.test(s)) return 0;
  return sign * parseFloat(s);
}

const isText = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const low = (v: unknown) => String(v ?? '').toLowerCase().trim();

/** Does this sheet look like a Tally trial balance? (Particulars + Debit + Credit, but no voucher columns.) */
export function looksLikeTrialBalance(rows: unknown[][]): boolean {
  const head = rows.slice(0, 25).map((r) => (r ?? []).map(low).join(' | ')).join(' || ');
  if (/vch|voucher|bill ref/.test(head)) return false;
  const hasParticulars = /particulars|ledger name|account name/.test(head);
  const hasDrCr = /debit/.test(head) && /credit/.test(head);
  const titled = /trial balance/.test(head);
  return (hasParticulars && hasDrCr) || (titled && hasDrCr);
}

const HEADER_WORD = /(opening|closing|balance|debit|credit|transactions?|\bdr\b|\bcr\b|particulars)/;
const CR_NATURE = /(capital|partner|loan|payable|creditor|provision|reserve|surplus|sales|income|borrowing|\bod\b|overdraft)/i;
const hasDrCrSuffix = (v: unknown) => typeof v === 'string' && /\b(dr|cr)\b\.?\s*$/i.test(v.trim());

/** Sign of an unsigned closing figure, from opening + debits - credits; falls back to the ledger's nature. */
function inferSign(name: string, openRaw: unknown, drV: number, crV: number, closeAbs: number): number {
  const o = tbNum(openRaw); const oAbs = Math.abs(o);
  const hasOpenSign = hasDrCrSuffix(openRaw);
  const cands = new Set<number>();
  for (const sc of [1, -1]) {
    const opts = hasOpenSign ? [o] : oAbs ? [oAbs, -oAbs] : [0];
    if (opts.some((on) => Math.abs(on + drV - crV - sc * closeAbs) <= 1)) cands.add(sc);
  }
  if (cands.size === 1) return [...cands][0];
  return CR_NATURE.test(name) ? -1 : 1;
}

export function readTbRows(rows: unknown[][]): TbRow[] {
  let h = rows.findIndex((r) => (r ?? []).some((c) => /^(particulars|ledger name|account name)$/.test(low(c))));
  if (h < 0) h = rows.findIndex((r) => (r ?? []).some((c) => /debit/.test(low(c))) && (r ?? []).some((c) => /credit/.test(low(c))));
  if (h < 0) return [];
  const nameCol = Math.max(0, (rows[h] ?? []).findIndex((c) => /^(particulars|ledger name|account name)$/.test(low(c))));
  const isHeaderRow = (r: unknown[]) => {
    const cells = (r ?? []).filter((c, j) => j !== nameCol && String(c ?? '').trim() !== '');
    return cells.length > 0 && cells.every((c) => typeof c === 'string' && HEADER_WORD.test(low(c)) && tbNum(c) === 0);
  };
  let ds = h + 1;
  while (ds < rows.length && ds < h + 4 && isHeaderRow(rows[ds] ?? [])) ds++;
  const block = rows.slice(h, ds);
  const width = Math.max(...block.map((r) => (r ?? []).length), 0);
  // forward-filled header text per column, plus each column's own (lowest) label
  const filled: string[][] = block.map((r) => { let carry = ''; return Array.from({ length: width }, (_, j) => { const t = low((r ?? [])[j]); if (t) carry = t; return carry; }); });
  type Role = 'open' | 'openDr' | 'openCr' | 'txDr' | 'txCr' | 'close' | 'closeDr' | 'closeCr';
  const role: Record<number, Role> = {};
  for (let j = 0; j < width; j++) {
    if (j === nameCol) continue;
    const all = filled.map((f) => f[j]).join(' | ');
    let own = ''; for (let k = block.length - 1; k >= 0; k--) { const t = low((block[k] ?? [])[j]); if (t) { own = t; break; } }
    const isDr = /\b(debit|dr)\b/.test(own), isCr = /\b(credit|cr)\b/.test(own);
    if (/opening/.test(all)) role[j] = isDr ? 'openDr' : isCr ? 'openCr' : 'open';
    else if (/closing/.test(all)) role[j] = isDr ? 'closeDr' : isCr ? 'closeCr' : 'close';
    else if (/transaction|period|during/.test(all) && isDr) role[j] = 'txDr';
    else if (/transaction|period|during/.test(all) && isCr) role[j] = 'txCr';
    else if (isDr) role[j] = 'closeDr';
    else if (isCr) role[j] = 'closeCr';
    else if (/balance|amount/.test(own) && !Object.values(role).includes('close')) role[j] = 'close';
  }
  const col = (r: Role) => Number(Object.keys(role).find((k) => role[+k] === r) ?? -1);
  const c = { open: col('open'), openDr: col('openDr'), openCr: col('openCr'), txDr: col('txDr'), txCr: col('txCr'), close: col('close'), closeDr: col('closeDr'), closeCr: col('closeCr') };
  if (c.close < 0 && c.closeDr < 0 && c.closeCr < 0) return [];

  const out: TbRow[] = [];
  for (let i = ds; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = isText(r[nameCol]) ? String(r[nameCol]).trim() : '';
    if (!name || /^particulars$/i.test(name) || /^(grand\s+)?total\b/i.test(name)) continue;
    const get = (j: number) => (j >= 0 ? r[j] : '');
    const txD = Math.abs(tbNum(get(c.txDr))), txC = Math.abs(tbNum(get(c.txCr)));
    let net: number;
    if (c.closeDr >= 0 || c.closeCr >= 0) net = Math.abs(tbNum(get(c.closeDr))) - Math.abs(tbNum(get(c.closeCr)));
    else {
      const raw = get(c.close), v = tbNum(raw);
      net = hasDrCrSuffix(raw) || v === 0 ? v : inferSign(name, get(c.open), txD, txC, Math.abs(v)) * Math.abs(v);
    }
    let op: number | null = null;
    if (c.openDr >= 0 || c.openCr >= 0) op = Math.abs(tbNum(get(c.openDr))) - Math.abs(tbNum(get(c.openCr)));
    else if (c.open >= 0) { const raw = get(c.open); op = tbNum(raw); }
    out.push({ name, net, opening: op });
  }
  return out;
}

// ---------- hierarchy reconstruction ----------
const GROUP_WORDS = /(accounts?|group|debtors|creditors|assets|liabilit|loans|capital|reserves|surplus|stock|expenses|incomes?|investments|deposits|provisions|duties|taxes|bank|cash|sales|purchase|borrowings|payables|receivables|advances|equity)/i;
interface Leaf { row: TbRow; rel: string[] }
function buildLeaves(rows: TbRow[]): Leaf[] {
  const n = rows.length;
  const memo = new Map<number, { leaves: Leaf[]; next: number }>();
  const TOL = 1;
  function parse(i: number): { leaves: Leaf[]; next: number } {
    const hit = memo.get(i); if (hit) return hit;
    const r = rows[i];
    let res = { leaves: [{ row: r, rel: [] as string[] }], next: i + 1 };
    if (Math.abs(r.net) >= TOL && GROUP_WORDS.test(r.name)) {
      let j = i + 1, sum = 0, kids: Leaf[] = [], count = 0;
      while (j < n && count < 400) {
        const c = parse(j);
        sum += c.leaves.reduce((s, l) => s + l.row.net, 0);
        kids = kids.concat(c.leaves); j = c.next; count++;
        if (Math.abs(sum - r.net) <= TOL) { res = { leaves: kids.map((k) => ({ row: k.row, rel: [r.name, ...k.rel] })), next: j }; break; }
      }
    }
    memo.set(i, res);
    return res;
  }
  const leaves: Leaf[] = [];
  for (let i = 0; i < n;) { const r = parse(i); leaves.push(...r.leaves); i = r.next; }
  return leaves;
}

// ---------- mapping ----------
type Key = keyof FinancialLineItems;
function classify(leaf: Leaf): { key: Key | 'party-debtor' | 'party-creditor'; amount: number; approx?: boolean } {
  const nm = leaf.row.name.toLowerCase();
  const path = leaf.rel.join(' > ').toLowerCase();
  const all = `${path} > ${nm}`;
  const net = leaf.row.net;
  const cr = -net; // credit-positive
  const has = (re: RegExp) => re.test(all);

  // ----- P&L -----
  if (has(/sales accounts|(?<!in)direct incomes?/) || (/^sales\b/.test(nm) && net < 0)) return { key: 'revenue', amount: cr };
  if (has(/purchase accounts/)) return { key: 'purchases', amount: net };
  if (/^opening stock/.test(nm)) return has(/current assets|stock-in-hand|stock in hand/) ? { key: 'inventories', amount: net } : { key: 'changeInInventories', amount: net };
  if (/^closing stock/.test(nm) && net < 0) return { key: 'changeInInventories', amount: net };
  if (has(/indirect incomes?/)) return { key: 'otherIncome', amount: cr };
  const inExpenseGroup = has(/direct expenses|indirect expenses|expenses \(direct\)|expenses \(indirect\)/);
  if (inExpenseGroup || /depreciation/.test(nm)) {
    if (/depreciation|amortis|amortiz/.test(nm)) return { key: 'depreciation', amount: net };
    if (/interest|finance (cost|charge)|loan processing|processing fee/.test(nm)) return { key: 'financeCost', amount: net };
    if (/income tax|provision for (income )?tax|taxation|current tax|deferred tax/.test(nm)) return { key: 'tax', amount: net };
    if (has(/(?<!in)direct expenses/) || /salar|wage|bonus|staff|provident|\besi\b|gratuity|employee|labour|labor/.test(nm)) return { key: 'directExpenses', amount: net };
    return { key: 'otherExpenses', amount: net };
  }

  // ----- Balance sheet -----
  if (has(/sundry debtors/)) return net >= 0 ? { key: 'party-debtor', amount: net } : { key: 'otherCL', amount: cr, approx: true };
  if (has(/sundry creditors/)) return net <= 0 ? { key: 'party-creditor', amount: cr } : { key: 'otherCA', amount: net, approx: true };
  if (has(/capital account|reserves|surplus|share capital|partners?'?s? capital|proprietor|drawings|profit & loss a\/c|profit and loss a\/c/)) return { key: 'ownersCapital', amount: cr };
  if (has(/deferred tax liab/)) return { key: 'deferredTaxLiab', amount: cr };
  if (has(/bank od|overdraft|cash credit|\bocc\b|\bod a\/c/) || (has(/bank accounts/) && net < 0)) return { key: 'stBorrowings', amount: cr };
  if (has(/loans \(liability\)|secured loans|unsecured loans|term loan|borrowings/)) {
    if (has(/unsecured/)) return { key: 'unsecuredLoans', amount: cr };
    if (has(/secured|term loan|vehicle|car loan|machinery loan/)) return { key: 'securedLoans', amount: cr };
    if (/working capital|\bwc\b/.test(nm)) return { key: 'stBorrowings', amount: cr, approx: true };
    return { key: 'unsecuredLoans', amount: cr, approx: true };
  }
  if (has(/provision/)) return { key: 'stProvisions', amount: cr };
  if (has(/fixed assets/)) return { key: 'ppe', amount: net };
  if (has(/investments?/)) return { key: 'investments', amount: net };
  if (has(/stock-in-hand|stock in hand|closing stock|inventor/)) return { key: 'inventories', amount: net };
  if (has(/bank accounts|cash-in-hand|cash in hand|bank a\/c/) || /^cash\b|bank/.test(nm)) return { key: 'cash', amount: net };
  if (has(/duties & taxes|duties and taxes|gst|tds|tcs/)) return net >= 0 ? { key: 'otherCA', amount: net } : { key: 'otherCL', amount: cr };
  if (has(/current liabilities/)) return net <= 0 ? { key: 'otherCL', amount: cr } : { key: 'otherCA', amount: net, approx: true };
  if (has(/current assets|loans & advances|deposits|misc\. expenses|suspense/)) return net >= 0 ? { key: 'otherCA', amount: net } : { key: 'otherCL', amount: cr, approx: true };
  // unknown: place by sign and say so
  return net >= 0 ? { key: 'otherCA', amount: net, approx: true } : { key: 'otherCL', amount: cr, approx: true };
}

const BS_KEYS: Key[] = ['ownersCapital', 'securedLoans', 'unsecuredLoans', 'deferredTaxLiab', 'stBorrowings', 'tradePayables', 'otherCL', 'stProvisions', 'ppe', 'investments', 'inventories', 'receivables', 'cash', 'otherCA'];

export function parseTrialBalance(rows: unknown[][], opts: TbOptions = {}): TbResult {
  const tb = readTbRows(rows);
  const warnings: string[] = [];
  if (!tb.length) return { items: {}, mapped: [], unmapped: [], warnings: ['No trial-balance rows found (need Particulars, Debit and Credit columns).'], tbDebit: 0, tbCredit: 0, debtors: [], creditors: [], rowsRead: 0 };

  const leaves = buildLeaves(tb);
  const tbDebit = leaves.reduce((s, l) => s + Math.max(0, l.row.net), 0);
  const tbCredit = leaves.reduce((s, l) => s + Math.max(0, -l.row.net), 0);
  const items: Record<string, number> = {};
  const add = (k: string, v: number) => { items[k] = (items[k] ?? 0) + v; };
  const mapped: MappedLeaf[] = [], unmapped: MappedLeaf[] = [];
  const debtors: TbParty[] = [], creditors: TbParty[] = [];
  let stockOpeningFromCol: number | null = null;

  for (const leaf of leaves) {
    if (Math.abs(leaf.row.net) < 0.5) continue;
    const c = classify(leaf);
    const m: MappedLeaf = { name: leaf.row.name, path: leaf.rel.join(' > '), key: c.key, amount: c.amount, approx: c.approx };
    if (c.key === 'party-debtor') { add('receivables', c.amount); if (!/^sundry debtors?$/i.test(leaf.row.name.trim())) debtors.push({ name: leaf.row.name, amount: c.amount }); }
    else if (c.key === 'party-creditor') { add('tradePayables', c.amount); if (!/^sundry creditors?$/i.test(leaf.row.name.trim())) creditors.push({ name: leaf.row.name, amount: c.amount }); }
    else add(c.key, c.amount);
    if (c.key === 'inventories' && leaf.row.opening !== null) stockOpeningFromCol = (stockOpeningFromCol ?? 0) + leaf.row.opening;
    (c.approx ? unmapped : mapped).push(m);
    if (c.approx) mapped.push(m);
  }

  // ----- closing stock -----
  const hasExplicitStockLedgers = leaves.some((l) => (/^opening stock/i.test(l.row.name) && l.row.net > 0 && !/current assets|stock-in-hand|stock in hand/i.test(l.rel.join(' '))) || (/^closing stock/i.test(l.row.name) && l.row.net < 0));
  if (!hasExplicitStockLedgers) {
    if (opts.closingStock != null) {
      const s0 = items.inventories ?? 0;                         // TB carries the opening value
      items.changeInInventories = (items.changeInInventories ?? 0) + (s0 - opts.closingStock);
      items.inventories = opts.closingStock;
    } else if (stockOpeningFromCol !== null && Math.abs((items.inventories ?? 0) - stockOpeningFromCol) > 1) {
      items.changeInInventories = (items.changeInInventories ?? 0) + (stockOpeningFromCol - (items.inventories ?? 0));
    } else if (items.inventories) {
      warnings.push('Closing stock was not adjusted in this trial balance, so profit may be mis-stated. Enter the closing stock value to correct it.');
    }
  } else if (items.changeInInventories === undefined) items.changeInInventories = 0;

  // ----- profit and capital (TB is pre-closing: current-year profit is not yet in capital) -----
  const hasPL = (items.revenue ?? 0) !== 0 || (items.purchases ?? 0) !== 0;
  const g = (k: string) => items[k] ?? 0;
  if (hasPL) {
    const profit = g('revenue') + g('otherIncome') - g('purchases') - g('directExpenses') - g('changeInInventories') - g('depreciation') - g('financeCost') - g('otherExpenses') - g('tax');
    items.pat = profit;
    items.ownersCapital = g('ownersCapital') + profit;
  } else warnings.push('No sales/purchase ledgers found - treated as a balance-sheet-only trial balance (profit and loss will be blank).');

  // ----- checks -----
  if (Math.abs(tbDebit - tbCredit) > Math.max(10, 0.0001 * Math.max(tbDebit, tbCredit))) warnings.push(`Trial balance does not tally after reading: debits ${Math.round(tbDebit)} vs credits ${Math.round(tbCredit)}. Check the export includes all groups.`);
  const assets = ['ppe', 'investments', 'inventories', 'receivables', 'cash', 'otherCA'].reduce((s, k) => s + g(k), 0);
  const liabs = ['ownersCapital', 'securedLoans', 'unsecuredLoans', 'deferredTaxLiab', 'stBorrowings', 'tradePayables', 'otherCL', 'stProvisions'].reduce((s, k) => s + g(k), 0);
  if (assets && Math.abs(assets - liabs) > Math.max(1000, 0.005 * assets)) warnings.push(`Assets ${Math.round(assets)} and liabilities + capital ${Math.round(liabs)} differ by ${Math.round(Math.abs(assets - liabs))} - usually missing closing stock or an unmapped ledger.`);
  const lumped = leaves.filter((l) => /^(current assets|current liabilities|loans \(liability\)|indirect expenses|expenses \(indirect\))$/i.test(l.row.name) && Math.abs(l.row.net) > 0);
  if (lumped.length) warnings.push(`This trial balance is only at primary-group level (${lumped.map((l) => l.row.name).join(', ')}), so it cannot be split into debtors, creditors, stock, cash, interest, depreciation, etc. Export it again with all ledgers shown.`);
  if ((items.receivables || items.tradePayables) && !debtors.length && !creditors.length) warnings.push('Sundry Debtors / Creditors appear only as totals in this trial balance (customer and vendor ledgers are not expanded). Totals are used; for party-wise detail upload the ageing sheets.');
  if (unmapped.length) warnings.push(`${unmapped.length} ledger(s) were placed by best guess - review the mapping list.`);

  const out: Partial<FinancialLineItems> = {};
  for (const k of Object.keys(EMPTY_LINE_ITEMS) as Key[]) if (items[k] !== undefined) out[k] = Math.round(items[k] * 100) / 100;
  for (const k of BS_KEYS) if (out[k] === undefined) out[k] = 0;
  return { items: out, mapped, unmapped, warnings, tbDebit, tbCredit, debtors, creditors, rowsRead: tb.length };
}
