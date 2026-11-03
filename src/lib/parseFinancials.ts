import * as XLSX from 'xlsx';
import { FinancialLineItems, EMPTY_LINE_ITEMS } from './types';
import { looksLikeTrialBalance, parseTrialBalance, TbResult, TbOptions } from './parseTrialBalance';

// Maps internal field keys to keyword fragments to look for in row labels (lowercased).
// excludeNonCurrent: true means a "(non-current)" sub-classification of this field must NOT
// match — used for fields our schema treats as current assets (e.g. receivables), where some
// companies separately disclose a small non-current portion as its own note. Not applied to
// 'investments', which Schedule III classifies as non-current by default.
const FIELD_MAP: [keyof FinancialLineItems, string[], boolean?][] = [
  ['revenue', ['revenue from operation', 'total revenue', 'net sales', 'turnover']],
  ['otherIncome', ['other income']],
  ['purchases', ['cost of material', 'purchase of goods', 'purchases']],
  ['directExpenses', ['employee benefit', 'direct expense']],
  ['changeInInventories', ['change in inventor', 'changes in inventor']],
  ['depreciation', ['depreciation']],
  ['financeCost', ['finance cost', 'interest expense', 'interest cost']],
  ['otherExpenses', ['other expense']],
  ['tax', ['current tax', 'tax expense']],
  ['pbt', ['profit before tax', 'net profit before tax', 'profit / (loss) before tax', 'profit/(loss) before tax', 'profit(loss) before tax', 'net profit ( or loss ) before tax']],
  ['pat', ['profit for the period', 'profit / (loss) for the period', 'profit(loss) for the period', 'profit for the year', 'net profit', 'profit after tax']],
  ['ownersCapital', ["owner's capital", 'owners capital', 'capital account', 'shareholders fund', "shareholder's fund", 'net worth', 'proprietor', 'total share holders']],
  ['unsecuredLoans', ['unsecured borrowing', 'unsecured loan', 'long-term borrowings-unsecured', 'long term borrowings-unsecured', 'long-term borrowing-unsecured']],
  ['securedLoans', ['secured borrowing', 'secured loan', 'long-term borrowings-secured', 'long term borrowings-secured', 'long-term borrowing-secured']],
  ['deferredTaxLiab', ['deferred tax liabilit']],
  ['stBorrowings', ['short term borrowing', 'short-term borrowing', 'st borrowing']],
  ['tradePayables', ['trade payable', 'sundry creditor'], true],
  ['otherCL', ['other current liabilit']],
  ['stProvisions', ['short term provision', 'short-term provision']],
  ['ppe', ['property plant', 'property, plant', 'fixed asset']],
  ['investments', ['non current investment', 'non-current investment']],
  ['inventories', ['inventor', 'closing stock'], true],
  ['receivables', ['trade receivable', 'sundry debtor', 'debtors'], true],
  ['cash', ['cash and cash equivalent', 'cash & bank', 'cash and bank', 'cash-in-hand', 'cash at bank'], true],
  ['otherCA', ['other current asset']],
];

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v;
  const raw = String(v);
  // Text with embedded arithmetic or commentary (e.g. "17239780.12/30456960.79*100=56.60%") is a
  // working/ratio note, not a figure - parseFloat would wrongly read just the numerator.
  if (/[\/=*]/.test(raw)) return null;
  const cleaned = raw.replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^-?\d*\.?\d+(e[+-]?\d+)?%?$/i.test(cleaned)) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function matchField(label: unknown): keyof FinancialLineItems | null {
  const norm = String(label ?? '').toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ').trim();
  if (!norm) return null;
  // Real line-item labels are short. Long paragraphs (collateral/security descriptions, notes,
  // disclosures) sometimes contain a stray keyword by coincidence and must never match.
  if (norm.length > 120) return null;
  // Ratio / percentage rows (e.g. "Net profit / turnover") are not line items.
  if (/\/\s*(turnover|revenue|sales)|(turnover|revenue|sales)\s*\/|\bratio\b|\bgross turnover\b|stock-in-trade/.test(norm)) return null;
  const isNonCurrent = /non[\s-]?current/.test(norm);
  for (const [key, keywords, excludeNonCurrent] of FIELD_MAP) {
    if (excludeNonCurrent && isNonCurrent) continue;
    if (keywords.some((kw) => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(norm))) return key;
  }
  return null;
}

export interface ParsedFinancials {
  current: Partial<FinancialLineItems>;
  previous: Partial<FinancialLineItems>;
  matchedLabels: { label: string; key: string }[];
}

export function parseFinancialsRows(rows: unknown[][]): ParsedFinancials {
  const current: Partial<FinancialLineItems> = {};
  const previous: Partial<FinancialLineItems> = {};
  const matchedLabels: { label: string; key: string }[] = [];

  for (const r of rows) {
    if (!r || r.length < 2) continue;
    let labelCol = -1;
    let key = matchField(r[0]);
    if (key) labelCol = 0;
    else {
      key = matchField(r[1]);
      if (key) labelCol = 1;
    }
    if (!key) continue;

    // Bounded window: only look at the few cells right after the label, so a stray
    // scientific-notation artifact far to the right can never be mistaken for a real value.
    let windowVals: number[] = [];
    for (let i = labelCol + 1; i <= labelCol + 3 && i < r.length; i++) {
      const n = num(r[i]);
      if (n !== null) windowVals.push(n);
    }
    // A leading small whole number (1-99) immediately after the label is almost always a
    // note-reference (e.g. "Note 5"), not a real financial figure — strip it. This also
    // correctly leaves [current, previous] as the FIRST and LAST of what remains, handling
    // both [note#, current, previous] layouts AND rows with an extra sub-detail column between
    // two real year-totals (e.g. [FY total, current-maturity sub-detail, prior FY total]).
    const isNoteRef = (n: number) => Number.isInteger(n) && n >= 1 && n <= 99;
    if (windowVals.length > 2 && isNoteRef(windowVals[0])) {
      windowVals = windowVals.slice(1);
    } else if (windowVals.length === 2 && isNoteRef(windowVals[0]) && !isNoteRef(windowVals[1])) {
      // [note#, current] with no previous-year figure
      windowVals = windowVals.slice(1);
    } else if (windowVals.length === 1 && isNoteRef(windowVals[0])) {
      // A lone small whole number is a note reference, not an amount (real balances are never < Rs 100).
      continue;
    }
    if (!windowVals.length) continue;
    const c = windowVals[0];
    const p = windowVals.length >= 2 ? windowVals[windowVals.length - 1] : null;

    if (c !== null) current[key] = c;
    if (p !== null) previous[key] = p;
    matchedLabels.push({ label: String(r[labelCol]), key });
  }
  return { current, previous, matchedLabels };
}

export function fillDefaults(partial: Partial<FinancialLineItems>): FinancialLineItems {
  const obj: FinancialLineItems = { ...EMPTY_LINE_ITEMS, ...partial };
  if (!obj.totalIncome) obj.totalIncome = obj.revenue + obj.otherIncome;
  if (!obj.totalExpenses) {
    obj.totalExpenses = obj.purchases + obj.directExpenses + obj.changeInInventories + obj.depreciation + obj.financeCost + obj.otherExpenses;
  }
  if (!obj.pbt) obj.pbt = obj.totalIncome - obj.totalExpenses;
  if (!obj.pat) obj.pat = obj.pbt - obj.tax;
  return obj;
}

// Classify a sheet as financials / receivables ageing / payables ageing / ledger / unrecognized.
export function classifySheet(sheetName: string, rows: unknown[][]): 'financials' | 'receivables' | 'payables' | 'inventory' | 'ledger' | 'trialbalance' | 'unrecognized' {
  const nameL = sheetName.toLowerCase();
  // Cash Flow Statements show period-on-period MOVEMENTS (e.g. "Trade Receivable" = the change
  // during the year), not point-in-time balances — the exact same line labels as the Balance
  // Sheet mean something entirely different here, so this sheet must never be scanned for
  // financials fields or it will silently corrupt real figures.
  if (nameL.includes('cash flow')) return 'unrecognized';
  if (/read ?me|instruction|how to use|guide|mapping/.test(nameL)) return 'unrecognized';
  const scanRows = rows.slice(0, 12).filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
  const headerText = scanRows.map((r) => r.map((c) => String(c ?? '').toLowerCase()).join(' ')).join(' ');

  const looksLikeLedger = /vch type|vch no|voucher/.test(headerText) && /debit/.test(headerText) && /credit/.test(headerText);
  if (looksLikeLedger) return 'ledger';
  if (looksLikeTrialBalance(rows)) return 'trialbalance';

  const looksAgeing = /overdue|ageing|aging|due date/.test(headerText) || /ageing|aging/.test(nameL);
  const looksInventory = (nameL.includes('inventor') || nameL.includes('stock') || headerText.includes('sku') || headerText.includes('item') || headerText.includes('days on hand') || headerText.includes('days-on-hand'))
    && (headerText.includes('value') || headerText.includes('amount') || headerText.includes('days'));
  if (looksInventory) return 'inventory';
  if ((nameL.includes('payable') || nameL.includes('creditor') || nameL.includes('vendor')) && (looksAgeing || headerText.includes('vendor') || headerText.includes('creditor'))) return 'payables';
  if ((nameL.includes('receivable') || nameL.includes('debtor') || nameL.includes('customer')) && (looksAgeing || headerText.includes('customer') || headerText.includes('debtor'))) return 'receivables';
  if (looksAgeing && (headerText.includes('customer') || headerText.includes('debtor'))) return 'receivables';
  if (looksAgeing && (headerText.includes('vendor') || headerText.includes('creditor') || headerText.includes('supplier'))) return 'payables';

  const finMatches = rows.filter((r) => r && (matchField(r[0]) || matchField(r[1]))).length;
  if (finMatches >= 4 || nameL.includes('financ') || headerText.includes('particular')) return 'financials';
  if (looksAgeing) return 'receivables';
  return 'unrecognized';
}

export interface ParsedAgeingRow { name: string; amount: number; days: number; marginPct?: number; isMsme?: boolean; }

function excelDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function findHeaderRowIndex(rows: unknown[][], keywordGroups: string[][]): number {
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i];
    if (!r || !r.some((c) => String(c ?? '').trim() !== '')) continue;
    const cells = r.map((c) => String(c ?? '').toLowerCase().trim());
    let score = 0;
    for (const group of keywordGroups) {
      if (cells.some((c) => group.some((k) => c.includes(k)))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function parseAgeingRows(rows: unknown[][], stats?: { missingDays: number }): ParsedAgeingRow[] {
  const nonEmpty = rows.filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
  if (!nonEmpty.length) return [];
  const keywordGroups = [
    ['customer', 'vendor', 'party', 'debtor', 'creditor', 'supplier', 'item', 'category', 'sku', 'name'],
    ['outstanding', 'amount', 'balance', 'value'],
    ['days overdue', 'overdue days', 'age (days)', 'days on hand', 'days outstanding', 'avg days', 'age', 'due date'],
  ];
  const headerIdx = findHeaderRowIndex(nonEmpty, keywordGroups);
  const header = nonEmpty[headerIdx].map((c) => String(c ?? '').toLowerCase().trim());
  const findIdx = (keywords: string[]) => header.findIndex((h) => keywords.some((k) => h.includes(k)));
  const nameIdx = findIdx(['customer', 'vendor', 'party', 'debtor', 'creditor', 'supplier', 'item', 'category', 'sku', 'name']);
  const amtIdx = findIdx(['outstanding', 'amount', 'balance', 'value']);
  const daysIdx = findIdx(['days overdue', 'overdue days', 'age (days)', 'days on hand', 'days-on-hand', 'days outstanding', 'avg days', 'age']);
  const dueDateIdx = findIdx(['due date']);
  const marginIdx = findIdx(['margin', 'profit %', 'profit%']);
  const msmeIdx = findIdx(['msme', 'vendor type', 'supplier type', 'udyam']);

  const out: ParsedAgeingRow[] = [];
  if (nameIdx < 0 || amtIdx < 0) return out;

  for (let i = headerIdx + 1; i < nonEmpty.length; i++) {
    const r = nonEmpty[i];
    const name = r[nameIdx];
    const amount = num(r[amtIdx]);
    if (!name || amount === null || amount === 0) continue;
    const nameNorm = String(name).toLowerCase().trim();
    if (/\(delete this row\)/.test(nameNorm)) continue; // template example row
    if (/^(grand )?total|^sub[\s-]?total|^closing balance$/.test(nameNorm)) continue;

    let days = daysIdx >= 0 ? num(r[daysIdx]) : null;
    if (days === null && dueDateIdx >= 0 && r[dueDateIdx]) {
      const dueDate = excelDate(r[dueDateIdx]);
      if (dueDate) days = Math.round((Date.now() - dueDate.getTime()) / 86400000);
    }
    // A blank days cell must never be read as "0 days" - that would paint the whole ageing green.
    if (days === null) { if (stats) stats.missingDays++; continue; }
    const marginPct = marginIdx >= 0 ? num(r[marginIdx]) : null;
    let isMsme: boolean | undefined;
    if (msmeIdx >= 0) {
      const raw = String(r[msmeIdx] ?? '').trim().toLowerCase();
      if (raw) isMsme = /^(y|yes|true|msme|micro|small|medium)/.test(raw);
    }
    out.push({
      name: String(name).trim(), amount, days,
      ...(marginPct !== null ? { marginPct } : {}),
      ...(isMsme !== undefined ? { isMsme } : {}),
    });
  }
  return out;
}

export interface ParsedLedgerRow { date: Date; particulars: string; vchType: string; vchNo: string; debit: number; credit: number; }

export function parseLedgerRows(rows: unknown[][]): ParsedLedgerRow[] {
  const nonEmpty = rows.filter((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
  if (!nonEmpty.length) return [];
  const keywordGroups = [['date'], ['particulars'], ['vch type'], ['vch no'], ['debit'], ['credit']];
  const headerIdx = findHeaderRowIndex(nonEmpty, keywordGroups);
  const header = nonEmpty[headerIdx].map((c) => String(c ?? '').toLowerCase().trim());
  const findIdx = (keywords: string[]) => header.findIndex((h) => keywords.some((k) => h.includes(k)));
  const dateIdx = findIdx(['date']);
  const particularsIdx = findIdx(['particulars']);
  const vchTypeIdx = findIdx(['vch type']);
  const vchNoIdx = findIdx(['vch no']);
  const debitIdx = findIdx(['debit']);
  const creditIdx = findIdx(['credit']);
  if (dateIdx < 0 || debitIdx < 0 || creditIdx < 0) return [];

  const out: ParsedLedgerRow[] = [];
  let lastDate: Date | null = null;
  for (let i = headerIdx + 1; i < nonEmpty.length; i++) {
    const r = nonEmpty[i];
    const d = excelDate(r[dateIdx]);
    if (d) lastDate = d;
    if (!lastDate) continue;
    const debit = num(r[debitIdx]) ?? 0;
    const credit = num(r[creditIdx]) ?? 0;
    if (debit === 0 && credit === 0) continue;
    out.push({
      date: lastDate,
      particulars: String(r[particularsIdx] ?? ''),
      vchType: String(r[vchTypeIdx] ?? ''),
      vchNo: String(r[vchNoIdx] ?? ''),
      debit, credit,
    });
  }
  return out;
}

// A few real Balance Sheet lines (e.g. "Current Investments", "Other Non-Current Assets") don't
// have a dedicated field in our schema and would otherwise be silently dropped, understating
// Total Assets. This narrowly matches just those known lines for ADDITIVE folding into the
// closest-fit bucket (first occurrence only — these lines commonly repeat in both the main BS
// and their own dedicated note, so summing every occurrence would double-count).
function extractAuxiliaryAsset(rows: unknown[][], patterns: RegExp[]): { current: number; previous: number } | null {
  let current = 0, previous = 0, found = false;
  for (const r of rows) {
    if (!r || r.length < 2) continue;
    for (const labelCol of [0, 1]) {
      const label = String(r[labelCol] ?? '').toLowerCase().trim();
      if (!label || label.length > 80) continue;
      if (!patterns.some((p) => p.test(label))) continue;
      const vals: number[] = [];
      for (let i = labelCol + 1; i <= labelCol + 3 && i < r.length; i++) {
        const n = num(r[i]);
        if (n !== null) vals.push(n);
      }
      if (vals.length > 2 && Number.isInteger(vals[0]) && vals[0] >= 1 && vals[0] <= 99) vals.shift();
      if (vals.length >= 1) { current += vals[0]; found = true; }
      if (vals.length >= 2) previous += vals[vals.length - 1];
      break;
    }
  }
  return found ? { current, previous } : null;
}
const CURRENT_INVESTMENTS_PATTERN = [/^\(?[a-z]?\)?\s*current investments?$/i, /^total current investments?$/i];
const OTHER_NONCURRENT_ASSETS_PATTERN = [/^\(?[a-z]?\)?\s*other non[\s-]?current assets?$/i, /^total other non[\s-]?current assets?$/i];

export interface UploadFileResult {
  filename: string;
  sheets: { name: string; type: string; detail: string }[];
  financials?: ParsedFinancials;
  receivables?: ParsedAgeingRow[];
  payables?: ParsedAgeingRow[];
  inventory?: ParsedAgeingRow[];
  ledgerRows?: { ledgerName: string; rows: ParsedLedgerRow[] }[];
  tb?: TbResult;
  warnings?: string[];
  error?: string;
}

export function processWorkbook(filename: string, buffer: Buffer, tbOpts: TbOptions = {}): UploadFileResult {
  const result: UploadFileResult = { filename, sheets: [] };
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    let ledgerRows: { ledgerName: string; rows: ParsedLedgerRow[] }[] = [];
    let receivables: ParsedAgeingRow[] = [];
    let payables: ParsedAgeingRow[] = [];
    let inventory: ParsedAgeingRow[] = [];
    let mergedCurrent: Partial<FinancialLineItems> = {};
    let mergedPrevious: Partial<FinancialLineItems> = {};
    let mergedMatched: { label: string; key: string }[] = [];
    const mergedComplete = new Set<keyof FinancialLineItems>();
    let auxCurrentInv: { current: number; previous: number } | null = null;
    let auxOtherNonCurrent: { current: number; previous: number } | null = null;

    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' }) as unknown[][];
      const type = classifySheet(sheetName, rows);

      if (type === 'financials') {
        const parsed = parseFinancialsRows(rows);
        // Merge across sheets, field by field. A field is "complete" once we have both its
        // current AND previous value — a complete match always wins over a partial one,
        // regardless of which sheet it came from. Among equally complete matches, the first
        // one wins (summary sheets are processed before note-detail sheets).
        for (const k of Object.keys({ ...parsed.current, ...parsed.previous }) as (keyof FinancialLineItems)[]) {
          const newC = parsed.current[k];
          const newP = parsed.previous[k];
          const newIsComplete = newC !== undefined && newP !== undefined;
          const alreadyComplete = mergedComplete.has(k);
          if (alreadyComplete && !newIsComplete) continue;
          if (alreadyComplete && newIsComplete) continue;
          if (newC !== undefined) mergedCurrent[k] = newC;
          if (newP !== undefined) mergedPrevious[k] = newP;
          if (newIsComplete) mergedComplete.add(k);
        }
        mergedMatched = mergedMatched.concat(parsed.matchedLabels);
        const ci = extractAuxiliaryAsset(rows, CURRENT_INVESTMENTS_PATTERN);
        if (ci && !auxCurrentInv) auxCurrentInv = ci;
        const onca = extractAuxiliaryAsset(rows, OTHER_NONCURRENT_ASSETS_PATTERN);
        if (onca && !auxOtherNonCurrent) auxOtherNonCurrent = onca;
        result.sheets.push({ name: sheetName, type, detail: `${parsed.matchedLabels.length} fields matched` });
      } else if (type === 'trialbalance') {
        // re-read with formatted text so Tally's "Dr"/"Cr" suffixes on balances are kept
        const tbRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: false }) as unknown[][];
        const tbr = parseTrialBalance(tbRows, tbOpts);
        if (!result.tb || tbr.rowsRead > result.tb.rowsRead) result.tb = tbr;
        result.sheets.push({ name: sheetName, type, detail: `Tally trial balance: ${tbr.rowsRead} rows read, ${tbr.mapped.length} ledgers mapped` });
      } else if (type === 'ledger') {
        const parsedRows = parseLedgerRows(rows);
        ledgerRows.push({ ledgerName: sheetName, rows: parsedRows });
        result.sheets.push({ name: sheetName, type, detail: `${parsedRows.length} transaction rows` });
      } else if (type === 'receivables') {
        const st = { missingDays: 0 };
        const recs = parseAgeingRows(rows, st);
        if (st.missingDays) (result.warnings ??= []).push(`${sheetName}: ${st.missingDays} row(s) have no days value and were skipped - fill 'Avg Days Outstanding' to include them.`);
        receivables = receivables.concat(recs);
        result.sheets.push({ name: sheetName, type, detail: `${recs.length} customer rows` });
      } else if (type === 'payables') {
        const st = { missingDays: 0 };
        const recs = parseAgeingRows(rows, st);
        if (st.missingDays) (result.warnings ??= []).push(`${sheetName}: ${st.missingDays} row(s) have no days value and were skipped - fill 'Avg Days Outstanding' to include them.`);
        payables = payables.concat(recs);
        result.sheets.push({ name: sheetName, type, detail: `${recs.length} vendor rows` });
      } else if (type === 'inventory') {
        const st = { missingDays: 0 };
        const recs = parseAgeingRows(rows, st);
        if (st.missingDays) (result.warnings ??= []).push(`${sheetName}: ${st.missingDays} row(s) have no days value and were skipped - fill 'Avg Days Outstanding' to include them.`);
        inventory = inventory.concat(recs);
        result.sheets.push({ name: sheetName, type, detail: `${recs.length} item rows` });
      } else {
        result.sheets.push({ name: sheetName, type: 'unrecognized', detail: 'not used' });
      }
    }

    if (auxCurrentInv) {
      mergedCurrent.otherCA = (mergedCurrent.otherCA ?? 0) + auxCurrentInv.current;
      mergedPrevious.otherCA = (mergedPrevious.otherCA ?? 0) + auxCurrentInv.previous;
    }
    if (auxOtherNonCurrent) {
      mergedCurrent.investments = (mergedCurrent.investments ?? 0) + auxOtherNonCurrent.current;
      mergedPrevious.investments = (mergedPrevious.investments ?? 0) + auxOtherNonCurrent.previous;
    }
    if (mergedMatched.length) result.financials = { current: mergedCurrent, previous: mergedPrevious, matchedLabels: mergedMatched };
    if (ledgerRows.length) result.ledgerRows = ledgerRows;
    if (receivables.length) result.receivables = receivables;
    if (payables.length) result.payables = payables;
    if (inventory.length) result.inventory = inventory;
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Could not read this file';
  }
  return result;
}
