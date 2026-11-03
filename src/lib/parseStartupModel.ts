import * as XLSX from 'xlsx';
import { StartupMonth, StartupAssumptions, CapTableData, DataRoomItem, StartupDataBundle } from './startupTypes';

const USD_TO_INR = 95.5; // approx market rate — used only if the source model states figures are in USD

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v;
  const cleaned = String(v).replace(/[$₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Finds the header row containing "Month 1" (or similar) and returns how many month columns follow. */
function findMonthHeader(rows: unknown[][]): { headerRowIdx: number; startCol: number; numMonths: number } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i];
    if (!r) continue;
    for (let c = 0; c < r.length; c++) {
      if (/^month\s*1$/i.test(String(r[c] ?? '').trim())) {
        let numMonths = 0;
        for (let cc = c; cc < r.length; cc++) {
          if (/^month\s*\d+$/i.test(String(r[cc] ?? '').trim())) numMonths++;
          else break;
        }
        return { headerRowIdx: i, startCol: c, numMonths };
      }
    }
  }
  return null;
}

/** Extracts a row of monthly values whose label matches one of the given regex patterns (checked in order — put more specific patterns first to avoid collisions, e.g. "Net new ARR" before "ARR"). */
function extractSeries(rows: unknown[][], startCol: number, numMonths: number, patterns: RegExp[]): number[] | null {
  for (const r of rows) {
    if (!r || !r[0]) continue;
    const label = String(r[0]).trim();
    if (patterns.some((p) => p.test(label))) {
      const vals: number[] = [];
      for (let i = 0; i < numMonths; i++) {
        const n = num(r[startCol + i]);
        vals.push(n ?? 0);
      }
      return vals;
    }
  }
  return null;
}

function extractSingleValue(rows: unknown[][], patterns: RegExp[]): number | null {
  for (const r of rows) {
    if (!r || !r[0]) continue;
    const label = String(r[0]).trim();
    if (patterns.some((p) => p.test(label))) {
      for (let c = 1; c < r.length; c++) {
        const n = num(r[c]);
        if (n !== null) return n;
      }
    }
  }
  return null;
}

export interface StartupUploadResult {
  data?: StartupDataBundle;
  sheets: { name: string; detail: string }[];
  fieldsMatched: string[];
  fieldsMissing: string[];
  error?: string;
}

export function processStartupWorkbook(buffer: Buffer): StartupUploadResult {
  const result: StartupUploadResult = { sheets: [], fieldsMatched: [], fieldsMissing: [] };
  try {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheetRows: Record<string, unknown[][]> = {};
    for (const name of wb.SheetNames) {
      sheetRows[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as unknown[][];
    }
    const findSheet = (keyword: string) => wb.SheetNames.find((n) => n.toLowerCase().includes(keyword));

    // Detect currency from any sheet's free-text notes (defaults to already-INR if not found).
    const allText = Object.values(sheetRows).flat(2).map((v) => String(v ?? '')).join(' ').toLowerCase();
    const isUsd = /all figures in usd/.test(allText);
    const fx = isUsd ? USD_TO_INR : 1;

    const plSheet = findSheet('p&l') ?? findSheet('profit');
    const cfSheet = findSheet('cash flow');
    const ueSheet = findSheet('unit econom');
    const assumptionsSheet = findSheet('assumption');
    const capSheet = findSheet('cap table');
    const dataRoomSheet = findSheet('data room') ?? findSheet('checklist');

    if (!plSheet) {
      result.error = 'Could not find a P&L (Profit & Loss) sheet with monthly columns (looked for a sheet name containing "P&L" or "Profit").';
      return result;
    }
    const pl = sheetRows[plSheet];
    const header = findMonthHeader(pl);
    if (!header) {
      result.error = `Found a "${plSheet}" sheet but couldn't find a header row with "Month 1", "Month 2", etc. — this parser expects monthly columns.`;
      return result;
    }
    const { startCol, numMonths } = header;
    result.sheets.push({ name: plSheet, detail: `${numMonths} months detected` });

    const ue = ueSheet ? sheetRows[ueSheet] : [];
    const cf = cfSheet ? sheetRows[cfSheet] : [];
    if (ueSheet) result.sheets.push({ name: ueSheet, detail: 'unit economics' });
    if (cfSheet) result.sheets.push({ name: cfSheet, detail: 'cash flow' });

    const get = (sheet: unknown[][], patterns: RegExp[]) => extractSeries(sheet, startCol, numMonths, patterns);

    const series: Record<string, number[] | null> = {
      mrr: get(pl, [/^mrr\b/i]),
      cogs: get(pl, [/^cogs\b/i]),
      grossProfit: get(pl, [/^gross profit/i]),
      sm: get(pl, [/^sales\s*(&|and)\s*marketing/i]),
      ga: get(pl, [/^g\s*&\s*a\b/i, /^general.*administrative/i]),
      rd: get(pl, [/^r\s*&\s*d\b/i, /^research.*development/i]),
      opexTotal: get(pl, [/^total operating expense/i]),
      ebit: get(pl, [/^ebit\b/i]),
      netIncome: get(pl, [/^net income/i]),
      apBalance: get(cf, [/accounts payable/i]) ?? get(ue, [/accounts payable/i]),
      cashBal: get(ue, [/^cash balance/i]) ?? get(cf, [/^cash balance/i]),
      netBurn: get(ue, [/^net burn/i]),
      runway: get(ue, [/^runway/i]),
      newCust: get(ue, [/^new customers?$/i]),
      churnedCust: get(ue, [/^churned customers?/i]),
      endingCust: get(ue, [/^ending customers?/i]),
      arpu: get(ue, [/^arpu/i]),
      netNewArr: get(ue, [/^net new arr/i]),
      arr: get(ue, [/^arr\b/i]),
      burnMultiple: get(ue, [/^burn multiple/i]),
      cac: get(ue, [/^cac\s*\(/i]),
      ltvCacRatio: get(ue, [/^ltv\s*:\s*cac/i]),
      ltv: get(ue, [/^ltv\b(?!\s*:)/i]),
    };

    for (const [key, val] of Object.entries(series)) {
      if (val) result.fieldsMatched.push(key);
      else result.fieldsMissing.push(key);
    }
    if (!series.mrr || !series.netBurn || !series.cashBal) {
      result.error = `Missing critical fields (need at least MRR, Net Burn, and Cash Balance). Matched: ${result.fieldsMatched.join(', ') || 'none'}.`;
      return result;
    }

    const zeros = new Array(numMonths).fill(0);
    const months: StartupMonth[] = [];
    for (let i = 0; i < numMonths; i++) {
      months.push({
        month: `M${i + 1}`,
        mrr: (series.mrr ?? zeros)[i] * fx,
        cogs: (series.cogs ?? zeros)[i] * fx,
        grossProfit: (series.grossProfit ?? zeros)[i] * fx,
        sm: (series.sm ?? zeros)[i] * fx,
        ga: (series.ga ?? zeros)[i] * fx,
        rd: (series.rd ?? zeros)[i] * fx,
        opexTotal: (series.opexTotal ?? zeros)[i] * fx,
        ebit: (series.ebit ?? series.netIncome ?? zeros)[i] * fx,
        apBalance: (series.apBalance ?? zeros)[i] * fx,
        cashBal: (series.cashBal ?? zeros)[i] * fx,
        netBurn: (series.netBurn ?? zeros)[i] * fx,
        runway: (series.runway ?? zeros)[i],
        newCust: (series.newCust ?? zeros)[i],
        churnedCust: (series.churnedCust ?? zeros)[i],
        endingCust: (series.endingCust ?? zeros)[i],
        arpu: (series.arpu ?? zeros)[i] * fx,
        arr: (series.arr ?? zeros)[i] * fx,
        netNewArr: i === 0 ? null : (series.netNewArr ? series.netNewArr[i] * fx : null),
        burnMultiple: i === 0 ? null : (series.burnMultiple ? series.burnMultiple[i] : null),
        cac: (series.cac ?? zeros)[i] * fx,
        ltv: (series.ltv ?? zeros)[i] * fx,
        ltvCac: (series.ltvCacRatio ?? zeros)[i],
      });
    }

    // Assumptions (single-value rows, not monthly)
    const assumptionsRows = assumptionsSheet ? sheetRows[assumptionsSheet] : [];
    if (assumptionsSheet) result.sheets.push({ name: assumptionsSheet, detail: 'assumptions' });
    const grossMarginPct = (extractSingleValue(assumptionsRows, [/^gross margin/i]) ?? 0.7) * 100;
    const monthlyChurnRatePct = (extractSingleValue(assumptionsRows, [/^monthly churn rate/i]) ?? 0.0417) * 100;
    const avgLifetimeMonths = extractSingleValue(assumptionsRows, [/average customer lifetime/i]) ?? Math.round(1 / ((monthlyChurnRatePct || 4.17) / 100));

    const assumptions: StartupAssumptions = {
      grossMarginPct,
      monthlyChurnRatePct,
      avgLifetimeMonths,
      currency: 'INR',
    };

    // Cap table — prefer the Assumptions sheet (cleaner single-value rows); fall back to the
    // Cap Table Sensitivity sheet's "Base-Case Detail" block if Assumptions doesn't have them.
    const capRows = capSheet ? sheetRows[capSheet] : [];
    if (capSheet) result.sheets.push({ name: capSheet, detail: 'cap table' });
    const existingCommon = extractSingleValue(assumptionsRows, [/^existing common shares/i]) ?? extractSingleValue(capRows, [/^existing common shares/i]) ?? 0;
    const existingOptionPool = extractSingleValue(assumptionsRows, [/^existing option pool/i]) ?? extractSingleValue(capRows, [/^existing option pool/i]) ?? 0;
    const existingFdShares = extractSingleValue(assumptionsRows, [/^existing fully-diluted shares/i]) ?? extractSingleValue(capRows, [/^existing fully-diluted shares/i]) ?? (existingCommon + existingOptionPool);
    const baseRaise = (extractSingleValue(assumptionsRows, [/^base-case target raise/i, /^target raise/i]) ?? extractSingleValue(capRows, [/^target raise/i]) ?? 0) * fx;
    const basePremoney = (extractSingleValue(assumptionsRows, [/^base-case pre-money/i, /^pre-money valuation/i]) ?? extractSingleValue(capRows, [/^pre-money valuation/i]) ?? 0) * fx;

    // Sensitivity grid: header row has raise sizes across columns; subsequent rows have a
    // pre-money value in column 0 (numeric, not a label) — distinguishes it from the label rows
    // used elsewhere in this sheet.
    let sensitivityRaises: number[] = [];
    let sensitivityPremoneys: number[] = [];
    for (const r of capRows) {
      if (!r) continue;
      const first = r[0];
      if (typeof first === 'string' && /pre-money.*raise size/i.test(first)) {
        sensitivityRaises = r.slice(1).map((v) => num(v)).filter((v): v is number => v !== null && v > 0).map((v) => v * fx);
      } else if (typeof first === 'number' && first > 100000) {
        sensitivityPremoneys.push(first * fx);
      }
    }
    if (!sensitivityRaises.length) sensitivityRaises = [baseRaise * 0.75, baseRaise, baseRaise * 1.25].filter((v) => v > 0);
    if (!sensitivityPremoneys.length) sensitivityPremoneys = [basePremoney * 0.75, basePremoney * 0.875, basePremoney, basePremoney * 1.125, basePremoney * 1.25].filter((v) => v > 0);

    const capTable: CapTableData = {
      existingCommon, existingOptionPool, existingFdShares, baseRaise, basePremoney,
      sensitivityRaises, sensitivityPremoneys,
    };

    // Data room checklist — simple table: Category | Document | Status | (Notes)
    const dataRoom: DataRoomItem[] = [];
    if (dataRoomSheet) {
      result.sheets.push({ name: dataRoomSheet, detail: 'data room checklist' });
      const rows = sheetRows[dataRoomSheet];
      const headerIdx = rows.findIndex((r) => r && /category/i.test(String(r[0] ?? '')) && /document/i.test(String(r[1] ?? '')));
      if (headerIdx >= 0) {
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || !r[0] || !r[1]) continue;
          const statusRaw = String(r[2] ?? '').trim();
          const status: DataRoomItem['status'] =
            /ready/i.test(statusRaw) ? 'Ready' : /progress/i.test(statusRaw) ? 'In Progress' : 'Not Started';
          dataRoom.push({ category: String(r[0]).trim(), document: String(r[1]).trim(), status });
        }
      }
    }

    result.data = { months, assumptions, capTable, dataRoom };
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Could not read this file';
  }
  return result;
}
