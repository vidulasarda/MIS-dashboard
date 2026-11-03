import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { fillDefaults, ParsedAgeingRow } from '@/lib/parseFinancials';
import { processAnyFile } from '@/lib/processUpload';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    return await handleUpload(req);
  } catch (err) {
    console.error('Upload failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Server error: ${message}` }, { status: 500 });
  }
}

async function handleUpload(req: NextRequest) {
  const form = await req.formData();
  const files = form.getAll('files') as File[];
  const previousFiles = form.getAll('previousFiles') as File[];
  const num = (k: string) => { const v = form.get(k); const n = v === null || v === '' ? NaN : Number(String(v).replace(/,/g, '')); return isNaN(n) ? null : n; };
  const closingStock = num('closingStock'), previousClosingStock = num('previousClosingStock');
  const companyId = form.get('companyId') as string | null;
  const companyName = form.get('companyName') as string | null;
  const currentLabel = (form.get('currentPeriodLabel') as string) || 'Current';
  const currentEnd = form.get('currentPeriodEnd') as string | null;
  const previousLabel = (form.get('previousPeriodLabel') as string) || 'Previous';
  const previousEnd = form.get('previousPeriodEnd') as string | null;

  if (!files.length) return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
  if (!companyId && !companyName) {
    return NextResponse.json({ error: 'companyName is required when creating a new company' }, { status: 400 });
  }

  const fileReports = [];
  let financialsCurrent: Record<string, number> | null = null;
  let financialsPrevious: Record<string, number> | null = null;
  let matchedLabels: { label: string; key: string }[] = [];
  let allReceivables: ParsedAgeingRow[] = [];
  let allPayables: ParsedAgeingRow[] = [];
  let allInventory: ParsedAgeingRow[] = [];
  let allLedgerRows: { ledgerName: string; rows: { date: Date; particulars: string; vchType: string; vchNo: string; debit: number; credit: number }[] }[] = [];

  const warnings: string[] = [];
  let tbSummary: { mapped: number; review: number; debtors: number; creditors: number } | null = null;

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processAnyFile(file.name, buffer, { closingStock });
    fileReports.push({ filename: result.filename, sheets: result.sheets, error: result.error });
    if (result.warnings) warnings.push(...result.warnings.map((w) => `${file.name}: ${w}`));

    if (result.tb) {
      // Tally trial balance -> current year
      financialsCurrent = { ...(financialsCurrent ?? {}), ...(result.tb.items as Record<string, number>) };
      matchedLabels = matchedLabels.concat(result.tb.mapped.map((m) => ({ label: m.name, key: String(m.key) })));
      warnings.push(...result.tb.warnings.map((w) => `${file.name}: ${w}`));
      tbSummary = { mapped: result.tb.mapped.length, review: result.tb.unmapped.length, debtors: result.tb.debtors.length, creditors: result.tb.creditors.length };
    }
    if (result.financials?.matchedLabels.length) {
      financialsCurrent = { ...(financialsCurrent ?? {}), ...result.financials.current };
      financialsPrevious = { ...(financialsPrevious ?? {}), ...result.financials.previous };
      matchedLabels = matchedLabels.concat(result.financials.matchedLabels);
    }
    if (result.receivables) allReceivables = allReceivables.concat(result.receivables);
    if (result.payables) allPayables = allPayables.concat(result.payables);
    if (result.inventory) allInventory = allInventory.concat(result.inventory);
    if (result.ledgerRows) allLedgerRows = allLedgerRows.concat(result.ledgerRows);
  }

  // The "debtors/creditors only as totals" note is moot once ageing sheets are supplied
  if (allReceivables.length || allPayables.length) {
    for (let i = warnings.length - 1; i >= 0; i--) if (/appear only as totals/i.test(warnings[i])) warnings.splice(i, 1);
  }

  // Previous-year trial balance (a Tally TB has one year only; the prior year comes from a second export)
  for (const file of previousFiles) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await processAnyFile(file.name, buffer, { closingStock: previousClosingStock });
    fileReports.push({ filename: `${result.filename} (previous year)`, sheets: result.sheets, error: result.error });
    if (result.tb) {
      financialsPrevious = { ...(financialsPrevious ?? {}), ...(result.tb.items as Record<string, number>) };
      warnings.push(...result.tb.warnings.map((w) => `${file.name} (previous year): ${w}`));
    } else if (result.financials) {
      // a PDF / template supplied as the previous year: use its current-year column
      financialsPrevious = { ...(financialsPrevious ?? {}), ...result.financials.current };
    }
  }

  let company;
  if (companyId) {
    company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });
  } else {
    company = await prisma.company.create({ data: { name: companyName!, type: 'MSME' } });
  }

  if (financialsCurrent) {
    const currData = fillDefaults(financialsCurrent);
    const prevData = fillDefaults(financialsPrevious ?? {});

    await prisma.financialPeriod.upsert({
      where: { companyId_sequence: { companyId: company.id, sequence: 0 } },
      update: { label: currentLabel, periodEnd: currentEnd ? new Date(currentEnd) : new Date(), data: currData as any },
      create: { companyId: company.id, sequence: 0, label: currentLabel, periodEnd: currentEnd ? new Date(currentEnd) : new Date(), data: currData as any },
    });
    await prisma.financialPeriod.upsert({
      where: { companyId_sequence: { companyId: company.id, sequence: 1 } },
      update: { label: previousLabel, periodEnd: previousEnd ? new Date(previousEnd) : new Date(), data: prevData as any },
      create: { companyId: company.id, sequence: 1, label: previousLabel, periodEnd: previousEnd ? new Date(previousEnd) : new Date(), data: prevData as any },
    });
  }

  if (allReceivables.length || allPayables.length || allInventory.length) {
    const currentPeriod = await prisma.financialPeriod.findUnique({ where: { companyId_sequence: { companyId: company.id, sequence: 0 } } });
    if (currentPeriod) {
      // Only split into MSME/Other if the upload actually tagged rows with an MSME column —
      // absence of that column is not evidence the payables are (or aren't) MSME, so we don't
      // guess; everything goes to "other" (non-MSME) until proven otherwise, per the dashboard
      // spec's default direction (see workingCapitalCompute.ts).
      const taggedRows = allPayables.filter((p) => p.isMsme !== undefined);
      const msmeRows = taggedRows.filter((p) => p.isMsme === true);
      const otherRows = taggedRows.length ? allPayables.filter((p) => p.isMsme !== true) : allPayables;

      await prisma.financialPeriod.update({
        where: { id: currentPeriod.id },
        data: {
          disclosedReceivablesAgeing: allReceivables.length ? (allReceivables as any) : undefined,
          disclosedPayablesMsmeAgeing: msmeRows.length ? (msmeRows as any) : undefined,
          disclosedPayablesOtherAgeing: otherRows.length ? (otherRows as any) : undefined,
          disclosedInventoryAgeing: allInventory.length ? (allInventory as any) : undefined,
        },
      });
    }
  }

  for (const ledger of allLedgerRows) {
    if (!ledger.rows.length) continue;
    await prisma.ledgerTransaction.createMany({
      data: ledger.rows.map((r) => ({
        companyId: company.id,
        ledgerName: ledger.ledgerName,
        date: r.date,
        particulars: r.particulars,
        vchType: r.vchType,
        vchNo: r.vchNo,
        debit: r.debit,
        credit: r.credit,
      })),
    });
  }

  return NextResponse.json({
    companyId: company.id,
    companyName: company.name,
    fileReports,
    financialsMatched: financialsCurrent ? Object.keys(financialsCurrent).filter((k) => !['totalIncome', 'totalExpenses', 'pbt'].includes(k)).length : 0,
    financialsExpected: 24,
    warnings,
    tbSummary,
    receivablesRows: allReceivables.length,
    payablesRows: allPayables.length,
    inventoryRows: allInventory.length,
    ledgerBatches: allLedgerRows.map((l) => ({ name: l.ledgerName, rows: l.rows.length })),
  });
}
