import { processWorkbook, UploadFileResult } from './parseFinancials';
import { parsePdfFinancials } from './parsePdfFinancials';
import { TbOptions } from './parseTrialBalance';

/** Single entry point for every upload type: standard template / Tally trial balance (xlsx, xls, csv) / signed statements (pdf). */
export async function processAnyFile(filename: string, buffer: Buffer, tbOpts: TbOptions = {}): Promise<UploadFileResult> {
  if (/\.pdf$/i.test(filename)) {
    try {
      const r = await parsePdfFinancials(buffer);
      return {
        filename,
        sheets: [{ name: 'PDF statements', type: 'financials', detail: `${r.matchedLabels.length} fields read from PDF` }],
        financials: { current: r.current, previous: r.previous, matchedLabels: r.matchedLabels },
        warnings: r.warnings,
      };
    } catch (e) {
      return { filename, sheets: [], error: e instanceof Error ? e.message : String(e) };
    }
  }
  return processWorkbook(filename, buffer, tbOpts);
}
