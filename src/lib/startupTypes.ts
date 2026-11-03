export interface StartupMonth {
  month: string;          // "M1", "M2", ...
  mrr: number;
  cogs: number;
  grossProfit: number;
  sm: number;              // Sales & Marketing
  ga: number;               // G&A
  rd: number;               // R&D
  opexTotal: number;
  ebit: number;             // net income (no separate tax/interest modeled)
  apBalance: number;        // accounts payable
  cashBal: number;          // cash balance, end of month
  netBurn: number;
  runway: number;           // months, at that point in time
  newCust: number;
  churnedCust: number;
  endingCust: number;
  arpu: number;
  arr: number;               // annualized run-rate
  netNewArr: number | null;  // null for month 1 (no prior month to compare)
  burnMultiple: number | null;
  cac: number;
  ltv: number;
  ltvCac: number;
}

export interface StartupAssumptions {
  grossMarginPct: number;
  monthlyChurnRatePct: number;
  avgLifetimeMonths: number;
  currency: 'INR' | 'USD';
}

export interface CapTableData {
  existingCommon: number;
  existingOptionPool: number;
  existingFdShares: number;
  baseRaise: number;
  basePremoney: number;
  sensitivityRaises: number[];
  sensitivityPremoneys: number[];
}

export interface DataRoomItem {
  category: string;
  document: string;
  status: 'Ready' | 'In Progress' | 'Not Started';
}

export interface StartupDataBundle {
  months: StartupMonth[];
  assumptions: StartupAssumptions;
  capTable: CapTableData;
  dataRoom: DataRoomItem[];
}
