/** Builds the standard upload template (xlsx), optionally pre-filled from a trial balance or PDF. */
import ExcelJS from 'exceljs';
import { FinancialLineItems } from './types';
import { TbResult } from './parseTrialBalance';

type Key = keyof FinancialLineItems;
const ROWS: [string, number | null, Key | null, 'head' | 'line'][] = [
  ['PROFIT & LOSS', null, null, 'head'],
  ['Revenue from operations', 1, 'revenue', 'line'], ['Other income', 2, 'otherIncome', 'line'],
  ['Cost of materials consumed / Purchases of goods', 3, 'purchases', 'line'],
  ['Changes in inventories of finished goods and WIP', 4, 'changeInInventories', 'line'],
  ['Employee benefit expenses', 5, 'directExpenses', 'line'], ['Finance costs', 6, 'financeCost', 'line'],
  ['Depreciation and amortisation expense', 7, 'depreciation', 'line'], ['Other expenses', 8, 'otherExpenses', 'line'],
  ['Tax expense', 9, 'tax', 'line'], ['Profit for the year', null, 'pat', 'line'],
  ['BALANCE SHEET - EQUITY & LIABILITIES', null, null, 'head'],
  ["Owner's Capital / Shareholders funds (incl. reserves)", 10, 'ownersCapital', 'line'],
  ['Secured borrowings (long-term)', 11, 'securedLoans', 'line'], ['Unsecured borrowings (long-term)', 12, 'unsecuredLoans', 'line'],
  ['Deferred tax liabilities (net)', 13, 'deferredTaxLiab', 'line'], ['Short term borrowings', 14, 'stBorrowings', 'line'],
  ['Trade payables', 15, 'tradePayables', 'line'], ['Other current liabilities', 16, 'otherCL', 'line'], ['Short term provisions', 17, 'stProvisions', 'line'],
  ['BALANCE SHEET - ASSETS', null, null, 'head'],
  ['Property, plant and equipment (net block incl. CWIP)', 18, 'ppe', 'line'], ['Non-current investments', 19, 'investments', 'line'],
  ['Inventories', 20, 'inventories', 'line'], ['Trade receivables', 21, 'receivables', 'line'],
  ['Cash and cash equivalents', 22, 'cash', 'line'], ['Other current assets', 23, 'otherCA', 'line'],
];
const NAVY = 'FF1F3A5F', LIGHT = 'FFE8EEF5', INPUT = 'FFFFF8E1';
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const header = (ws: ExcelJS.Worksheet) => {
  const r = ws.getRow(1); r.eachCell((c) => { c.fill = fill(NAVY); c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { wrapText: true, vertical: 'middle' }; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
};

export interface FillInput {
  current?: Partial<FinancialLineItems>;
  previous?: Partial<FinancialLineItems>;
  tb?: TbResult | null;
  previousTb?: TbResult | null;
  notes?: string[];
  currentLabel?: string; previousLabel?: string;
}

export async function buildTemplateWorkbook(inp: FillInput = {}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const rd = wb.addWorksheet('READ ME');
  const lines = [
    'MIS Dashboard - Standard Upload Template', '',
    'Fill the yellow cells only. Do not rename sheets, change labels in column A, or insert columns.',
    'Amounts in Rupees (not lakhs/crores). Costs and liabilities as positive numbers. Enter 0 where nil - never leave blank.', '',
    'Sheet 1 - Financials: Profit & Loss and Balance Sheet, current year and previous year (Schedule III order).',
    'Sheet 2 - Trade Receivables: one row per customer. Required: Customer, Outstanding Amount, Avg Days Outstanding. Optional: Gross Margin %.',
    'Sheet 3 - Trade Payables: one row per vendor. Required: Vendor, Outstanding Amount, Avg Days Outstanding. Optional: MSME (Yes/No).',
    '          If MSME is left blank, all payables are treated as non-MSME.',
    'Sheet 4 - Inventory (optional): one row per item/SKU. Required: Item, Stock Value, Days on Hand.', '',
    'Checks the dashboard runs on upload: Balance Sheet balances; receivable/payable/inventory listings total to the balance-sheet figure.',
  ];
  if (inp.notes?.length) { lines.push('', 'CONVERSION NOTES - please review before uploading:'); inp.notes.forEach((n) => lines.push('  - ' + n)); }
  lines.forEach((l, i) => rd.getCell(i + 1, 1).value = l);
  rd.getCell(1, 1).font = { bold: true, size: 14 }; rd.getColumn(1).width = 130;

  const f = wb.addWorksheet('Financials');
  f.addRow(['Particulars', 'Note', `Current Year (${inp.currentLabel ?? 'FY 2025-26'})`, `Previous Year (${inp.previousLabel ?? 'FY 2024-25'})`]);
  header(f);
  for (const [label, note, key, kind] of ROWS) {
    const row = f.addRow([label, note, key ? inp.current?.[key] ?? null : null, key ? inp.previous?.[key] ?? null : null]);
    if (kind === 'head') row.eachCell({ includeEmpty: true }, (c) => { c.fill = fill(LIGHT); c.font = { bold: true }; });
    else for (const col of [3, 4]) { const c = row.getCell(col); c.fill = fill(INPUT); c.numFmt = '#,##0.00;(#,##0.00)'; }
  }
  f.getColumn(1).width = 58; f.getColumn(2).width = 7; f.getColumn(3).width = 26; f.getColumn(4).width = 26;
  f.addRow([]); f.addRow(['Notes: enter "Profit for the year" after tax. Dashboard recomputes PBT/EBITDA and flags it if your PAT differs.']).font = { italic: true, color: { argb: 'FF666666' } };

  const listing = (name: string, hdr: string[], widths: number[], rows: (string | number | null)[][], sideNote?: string) => {
    const w = wb.addWorksheet(name); w.addRow(hdr); header(w);
    widths.forEach((x, i) => (w.getColumn(i + 1).width = x));
    rows.forEach((r) => w.addRow(r));
    for (let r = 2; r <= Math.max(2, w.rowCount); r++) for (let c = 1; c <= hdr.length; c++) w.getCell(r, c).fill = fill(INPUT);
    if (sideNote) { w.getCell(1, hdr.length + 2).value = sideNote; w.getColumn(hdr.length + 2).width = 70; w.getCell(1, hdr.length + 2).font = { italic: true, color: { argb: 'FFA32226' } }; }
    return w;
  };
  const debtors = inp.tb?.debtors ?? [], creditors = inp.tb?.creditors ?? [];
  const sideNote = 'Names and balances came from the trial balance. Days are NOT in a trial balance - fill "Avg Days Outstanding" from Tally bill-wise outstanding / the ageing macro.';
  listing('Trade Receivables', ['Customer', 'Outstanding Amount', 'Avg Days Outstanding', 'Gross Margin % (optional)'], [40, 20, 22, 24],
    debtors.length ? debtors.map((d) => [d.name, d.amount, null, null]) : [['Example Customer A (delete this row)', 1250000, 62, 18]], debtors.length ? sideNote : undefined);
  const tp = listing('Trade Payables', ['Vendor', 'Outstanding Amount', 'Avg Days Outstanding', 'MSME (Yes/No)'], [40, 20, 22, 16],
    creditors.length ? creditors.map((d) => [d.name, d.amount, null, null]) : [['Example Vendor A (delete this row)', 840000, 48, 'Yes']], creditors.length ? sideNote : undefined);
  (tp as any).dataValidations.add('D2:D1000', { type: 'list', allowBlank: true, formulae: ['"Yes,No"'] });
  listing('Inventory', ['Item', 'Stock Value', 'Days on Hand'], [40, 20, 18], [['Example Item A (delete this row)', 560000, 95]]);

  const mapping = inp.tb ?? null;
  if (mapping) {
    const m = wb.addWorksheet('Mapping review');
    m.addRow(['Ledger (from trial balance)', 'Group path', 'Placed in template line', 'Amount (Rs)', 'Check']); header(m);
    [60, 50, 28, 18, 26].forEach((x, i) => (m.getColumn(i + 1).width = x));
    for (const x of mapping.mapped) {
      const line = x.key === 'party-debtor' ? 'receivables' : x.key === 'party-creditor' ? 'tradePayables' : String(x.key);
      m.addRow([x.name, x.path, line, Math.round(x.amount), x.approx ? 'Best guess - please verify' : '']);
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
