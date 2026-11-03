export interface FinancialLineItems {
  revenue: number;
  otherIncome: number;
  totalIncome: number;
  purchases: number;
  directExpenses: number;
  changeInInventories: number;
  depreciation: number;
  financeCost: number;
  otherExpenses: number;
  totalExpenses: number;
  pbt: number;
  tax: number;
  pat: number;
  ownersCapital: number;
  securedLoans: number;
  unsecuredLoans: number;
  deferredTaxLiab: number;
  stBorrowings: number;
  tradePayables: number;
  otherCL: number;
  stProvisions: number;
  ppe: number;
  investments: number;
  inventories: number;
  receivables: number;
  cash: number;
  otherCA: number;
}

export const EMPTY_LINE_ITEMS: FinancialLineItems = {
  revenue: 0, otherIncome: 0, totalIncome: 0, purchases: 0, directExpenses: 0,
  changeInInventories: 0, depreciation: 0, financeCost: 0, otherExpenses: 0,
  totalExpenses: 0, pbt: 0, tax: 0, pat: 0, ownersCapital: 0, securedLoans: 0,
  unsecuredLoans: 0, deferredTaxLiab: 0, stBorrowings: 0, tradePayables: 0,
  otherCL: 0, stProvisions: 0, ppe: 0, investments: 0, inventories: 0,
  receivables: 0, cash: 0, otherCA: 0,
};

export interface DerivedMetrics extends FinancialLineItems {
  ncl: number;
  cl: number;
  ca: number;
  nonCA: number;
  totalAssets: number;
  grossProfit: number;
  ebitda: number;
  ebit: number;
  totalDebt: number;
  netWorth: number;
  workingCapital: number;
  cogs: number;
  debtorDays: number;
  creditorDays: number;
  inventoryDays: number;
  ccc: number;
  currentRatio: number;
  quickRatio: number;
  wcRatio: number;
  debtEquity: number;
  debtEbitda: number;
  interestCoverage: number;
  grossMargin: number;
  ebitdaMargin: number;
  ebitMargin: number;
  netMargin: number;
  capitalEmployed: number;
  roce: number;
  roa: number;
  assetTurnover: number;
  debtorTurnover: number;
  creditorTurnover: number;
  inventoryTurnover: number;
}

export interface FifoResult {
  asOf: string;
  openLots: { b0_30: number; b31_60: number; b61_90: number; b91_180: number; b181_365: number; b365plus: number };
  totalOpen: number;
  collectionSpeed: { b0_30: number; b31_60: number; b61_90: number; b91_180: number; b181_365: number; b365plus: number };
  totalMatched: number;
  weightedAvgDays: number;
  unmatchedCredit: number;
  totalInvoiced: number;
  transactionCount: number;
}

export interface HealthScoreBreakdown {
  label: string;
  score: number;
  max: number;
}

export interface HealthScore {
  total: number;
  band: { label: string; cls: 'good' | 'watch' | 'critical' };
  breakdown: HealthScoreBreakdown[];
}

export interface Alert {
  level: 'critical' | 'watch' | 'good';
  title: string;
  text: string;
}
