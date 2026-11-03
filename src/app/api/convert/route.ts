import { NextRequest, NextResponse } from 'next/server';
import { processAnyFile } from '@/lib/processUpload';
import { buildTemplateWorkbook } from '@/lib/fillTemplate';
import { FinancialLineItems } from '@/lib/types';
import { TbResult } from '@/lib/parseTrialBalance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Turns a Tally trial balance (xlsx/csv) and/or a signed-statements PDF into the standard template,
 *  so the user can review and correct it in Excel before uploading. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = form.getAll('files') as File[];
    const previousFiles = form.getAll('previousFiles') as File[];
    const num = (k: string) => { const v = form.get(k); const n = v === null || v === '' ? NaN : Number(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };
    if (!files.length) return NextResponse.json({ error: 'Choose a trial balance or PDF first' }, { status: 400 });

    let current: Partial<FinancialLineItems> = {}, previous: Partial<FinancialLineItems> = {};
    let tb: TbResult | null = null, previousTb: TbResult | null = null;
    const notes: string[] = [];
    for (const f of files) {
      const r = await processAnyFile(f.name, Buffer.from(await f.arrayBuffer()), { closingStock: num('closingStock') });
      if (r.error) return NextResponse.json({ error: `${f.name}: ${r.error}` }, { status: 422 });
      (r.warnings ?? []).forEach((w) => notes.push(`${f.name}: ${w}`));
      if (r.tb) { tb = r.tb; current = { ...current, ...r.tb.items }; r.tb.warnings.forEach((w) => notes.push(`${f.name}: ${w}`)); }
      if (r.financials) { current = { ...current, ...r.financials.current }; previous = { ...previous, ...r.financials.previous }; }
    }
    for (const f of previousFiles) {
      const r = await processAnyFile(f.name, Buffer.from(await f.arrayBuffer()), { closingStock: num('previousClosingStock') });
      if (r.error) return NextResponse.json({ error: `${f.name}: ${r.error}` }, { status: 422 });
      if (r.tb) { previousTb = r.tb; previous = { ...previous, ...r.tb.items }; r.tb.warnings.forEach((w) => notes.push(`${f.name} (previous year): ${w}`)); }
      else if (r.financials) previous = { ...previous, ...r.financials.current };
    }
    if (!Object.keys(current).length) return NextResponse.json({ error: 'Nothing readable found in the file(s).' }, { status: 422 });
    if (tb && !Object.keys(previous).length) notes.push('Previous-year column is empty: upload last year\'s trial balance too, or type it in. Without it, growth and trend figures cannot be shown.');

    const buf = await buildTemplateWorkbook({ current, previous, tb, previousTb, notes });
    return new NextResponse(new Uint8Array(buf as any) as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="MIS_Template_Prefilled.xlsx"',
        'X-Convert-Notes': encodeURIComponent(JSON.stringify(notes.slice(0, 12))),
      },
    });
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
